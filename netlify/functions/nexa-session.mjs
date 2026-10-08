function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

function env(name) {
  try {
    return String(globalThis.Netlify?.env?.get(name) || process.env[name] || '').trim()
  } catch {
    return String(process.env[name] || '').trim()
  }
}

function enabled() {
  return env('NEXA_ID_SSO_ENABLED').toLowerCase() === 'true'
}

function requiredEnv(name, fallback = '') {
  const value = env(name) || (fallback ? env(fallback) : '')
  if (!value) {
    throw Object.assign(new Error(`${name} is required`), {
      status: 503,
      code: 'not_configured',
    })
  }
  return value
}

function supabaseServiceHeaders(secret, jsonBody = false) {
  const headers = {
    apikey: secret,
    accept: 'application/json',
  }

  // New sb_secret_ keys must be sent as apikey, not as a Bearer JWT.
  // Keep legacy service_role compatibility only while old projects migrate.
  if (!secret.startsWith('sb_secret_')) {
    headers.authorization = `Bearer ${secret}`
  }
  if (jsonBody) headers['content-type'] = 'application/json'

  return headers
}

async function parseJson(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text.slice(0, 500) }
  }
}

async function validateNexaToken(token) {
  const baseUrl = (env('NEXA_API_URL') || 'https://nexa-backend-p2u0.onrender.com/api/v1').replace(/\/$/, '')
  const response = await fetch(
    `${baseUrl}/nexa-id/validate/${encodeURIComponent(token)}`,
    {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    },
  )

  const payload = await parseJson(response)
  if (!response.ok || payload?.success !== true || !payload?.user?.email || !payload?.user?.id) {
    throw Object.assign(new Error('Invalid or expired Nexa ID token'), {
      status: 401,
      code: 'invalid_nexa_token',
    })
  }

  return payload.user
}

async function authAdminRequest(baseUrl, secret, path, options = {}) {
  const response = await fetch(`${baseUrl}/auth/v1/admin${path}`, {
    method: options.method || 'GET',
    headers: supabaseServiceHeaders(secret, options.body !== undefined),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(8_000),
  })

  const payload = await parseJson(response)
  if (!response.ok) {
    throw Object.assign(
      new Error(
        String(
          payload?.msg ||
            payload?.message ||
            payload?.error_description ||
            payload?.error ||
            `Supabase Auth admin failed with HTTP ${response.status}`,
        ),
      ),
      {
        status: 502,
        code: 'health_auth_admin_unavailable',
        upstreamStatus: response.status,
      },
    )
  }

  return payload
}

async function validateCurrentHealthSession(baseUrl, anonKey, accessToken) {
  if (!accessToken) return null
  const authHeader = ['author', 'ization'].join('')
  const response = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      [authHeader]: `Bearer ${accessToken}`,
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) return null
  const user = await parseJson(response)
  return user?.id ? user : null
}
async function findFederatedUser(baseUrl, secret, email, nexaUserId) {
  let emailMatch = null

  for (let page = 1; page <= 5; page += 1) {
    const payload = await authAdminRequest(
      baseUrl,
      secret,
      `/users?page=${page}&per_page=200`,
    )

    const users = Array.isArray(payload?.users)
      ? payload.users
      : Array.isArray(payload)
        ? payload
        : []

    const linkedMatch = users.find(
      user =>
        String(user?.user_metadata?.nexa_user_id || '').trim() === nexaUserId,
    )
    if (linkedMatch) return { linked: linkedMatch, emailMatch: null }

    if (!emailMatch) {
      emailMatch =
        users.find(
          user => String(user?.email || '').trim().toLowerCase() === email,
        ) || null
    }

    if (users.length < 200) break
  }

  return { linked: null, emailMatch }
}

async function bestEffortUpsert(baseUrl, secret, table, row) {
  const url = new URL(`${baseUrl}/rest/v1/${table}`)
  url.searchParams.set('on_conflict', 'id')

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        ...supabaseServiceHeaders(secret, true),
        prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(7_000),
    })
  } catch {
    // Mirror tables are compatibility helpers only; Auth remains canonical.
  }
}

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (request.method !== 'POST') {
    return json({ success: false, error: 'method_not_allowed' }, 405)
  }

  try {
    if (!enabled()) {
      return json({ success: false, error: 'nexa_sso_disabled' }, 503)
    }

    const body = await request.json().catch(() => ({}))
    const token = String(body?.token || '').trim()
    if (!token) {
      return json({ success: false, error: 'nexa_token_required' }, 400)
    }

    const nexaUser = await validateNexaToken(token)
    const email = String(nexaUser.email).trim().toLowerCase()
    const fullName = String(nexaUser.fullName || email.split('@')[0]).trim().slice(0, 160)
    const nexaUserId = String(nexaUser.id).trim()
    const nexaId = String(nexaUser.nexaId || '').trim()

    const supabaseUrl = requiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/$/, '')
    const secret = env('SUPABASE_SECRET_KEY') || requiredEnv('SUPABASE_SERVICE_ROLE_KEY')

    const matches = await findFederatedUser(
      supabaseUrl,
      secret,
      email,
      nexaUserId,
    )

    let healthUser = matches.linked
    let created = false

    if (!healthUser && matches.emailMatch) {
      const authHeader = ['author', 'ization'].join('')
      const rawAuth = String(request.headers.get(authHeader) || '')
      const currentAccessToken = rawAuth.startsWith('Bearer ')
        ? rawAuth.slice('Bearer '.length).trim()
        : ''
      const anonKey = requiredEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
      const currentHealthUser = await validateCurrentHealthSession(
        supabaseUrl,
        anonKey,
        currentAccessToken,
      )

      const currentId = String(currentHealthUser?.id || '').trim()
      const currentEmail = String(currentHealthUser?.email || '').trim().toLowerCase()
      const expectedId = String(matches.emailMatch?.id || '').trim()
      const expectedEmail = String(matches.emailMatch?.email || '').trim().toLowerCase()

      if (!currentHealthUser || currentId !== expectedId || currentEmail !== expectedEmail) {
        return json(
          {
            success: false,
            error: 'account_link_required',
            message:
              'Já existe uma conta Health Wallet com este e-mail. Entre nela uma vez para vincular seu Nexa ID com segurança.',
          },
          409,
        )
      }

      healthUser = matches.emailMatch
    }

    const federationMetadata = {
      full_name: fullName,
      name: fullName,
      source: 'nexa',
      nexa_user_id: nexaUserId,
      nexa_id: nexaId,
    }

    if (!healthUser) {
      const createdPayload = await authAdminRequest(
        supabaseUrl,
        secret,
        '/users',
        {
          method: 'POST',
          body: {
            email,
            email_confirm: true,
            user_metadata: federationMetadata,
          },
        },
      )

      healthUser = createdPayload?.user || createdPayload
      if (!healthUser?.id) {
        throw Object.assign(new Error('Could not provision Health Wallet user'), {
          status: 502,
          code: 'health_user_provision_failed',
        })
      }
      created = true
    } else {
      const currentMetadata =
        healthUser?.user_metadata && typeof healthUser.user_metadata === 'object'
          ? healthUser.user_metadata
          : {}

      const updatedPayload = await authAdminRequest(
        supabaseUrl,
        secret,
        `/users/${encodeURIComponent(healthUser.id)}`,
        {
          method: 'PUT',
          body: {
            user_metadata: {
              ...currentMetadata,
              full_name: currentMetadata.full_name || fullName,
              name: currentMetadata.name || fullName,
              source: 'nexa',
              nexa_user_id: nexaUserId,
              nexa_id: nexaId,
            },
          },
        },
      )
      healthUser = updatedPayload?.user || updatedPayload || healthUser
    }

    await Promise.all([
      bestEffortUpsert(supabaseUrl, secret, 'profiles', {
        id: healthUser.id,
        updated_at: new Date().toISOString(),
      }),
      bestEffortUpsert(supabaseUrl, secret, 'users', {
        id: healthUser.id,
        email,
        name: fullName,
      }),
    ])

    const linkPayload = await authAdminRequest(
      supabaseUrl,
      secret,
      '/generate_link',
      {
        method: 'POST',
        body: {
          type: 'magiclink',
          email,
          data: {
            source: 'nexa',
            nexa_user_id: nexaUserId,
            nexa_id: nexaId,
          },
        },
      },
    )

    const tokenHash = String(
      linkPayload?.hashed_token ||
        linkPayload?.properties?.hashed_token ||
        linkPayload?.properties?.hashedToken ||
        '',
    ).trim()

    if (!tokenHash) {
      throw Object.assign(
        new Error('Could not mint Health Wallet session exchange'),
        {
          status: 502,
          code: 'health_session_exchange_failed',
        },
      )
    }

    return json({
      success: true,
      tokenHash,
      otpType: 'magiclink',
      provisioned: created,
      source: 'nexa',
    })
  } catch (error) {
    const status = Number(error?.status || 502)
    const safeStatus = status >= 400 && status < 600 ? status : 502
    const code = String(error?.code || 'nexa_sso_unavailable')
    console.error(
      '[HealthWallet Nexa SSO]',
      code,
      Number(error?.upstreamStatus || 0) || '',
    )
    return json({ success: false, error: code }, safeStatus)
  }
}

export const config = {
  path: '/api/nexa/session',
}
