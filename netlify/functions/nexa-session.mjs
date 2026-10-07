import { createClient } from '@supabase/supabase-js'

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

async function validateNexaToken(token) {
  const baseUrl = (env('NEXA_API_URL') || 'https://nexa-backend-p2u0.onrender.com/api/v1').replace(/\/$/, '')
  const response = await fetch(
    `${baseUrl}/nexa-id/validate/${encodeURIComponent(token)}`,
    {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    },
  )

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success !== true || !payload?.user?.email || !payload?.user?.id) {
    throw Object.assign(new Error('Invalid or expired Nexa ID token'), {
      status: 401,
      code: 'invalid_nexa_token',
    })
  }

  return payload.user
}

async function findUserByEmail(admin, email) {
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) throw error

    const users = Array.isArray(data?.users) ? data.users : []
    const match = users.find(
      user => String(user?.email || '').trim().toLowerCase() === email,
    )
    if (match) return match
    if (users.length < 200) break
  }

  return null
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

    const supabaseUrl = requiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
    const serviceRole = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(supabaseUrl, serviceRole, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    let healthUser = await findUserByEmail(admin, email)

    if (!healthUser) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          name: fullName,
          source: 'nexa',
          nexa_user_id: String(nexaUser.id),
          nexa_id: String(nexaUser.nexaId || ''),
        },
      })
      if (error || !data?.user) throw error || new Error('Could not provision Health Wallet user')
      healthUser = data.user
    } else {
      await admin.auth.admin
        .updateUserById(healthUser.id, {
          user_metadata: {
            ...(healthUser.user_metadata || {}),
            full_name: healthUser.user_metadata?.full_name || fullName,
            name: healthUser.user_metadata?.name || fullName,
            source: 'nexa',
            nexa_user_id: String(nexaUser.id),
            nexa_id: String(nexaUser.nexaId || ''),
          },
        })
        .catch(() => null)
    }

    await admin
      .from('profiles')
      .upsert(
        {
          id: healthUser.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      .then(() => null, () => null)

    await admin
      .from('users')
      .upsert(
        {
          id: healthUser.id,
          email,
          name: fullName,
        },
        { onConflict: 'id' },
      )
      .then(() => null, () => null)

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        data: {
          source: 'nexa',
          nexa_user_id: String(nexaUser.id),
          nexa_id: String(nexaUser.nexaId || ''),
        },
      },
    })

    const tokenHash = String(linkData?.properties?.hashed_token || '').trim()
    if (linkError || !tokenHash) {
      throw linkError || new Error('Could not mint Health Wallet session exchange')
    }

    return json({
      success: true,
      tokenHash,
      otpType: 'magiclink',
      provisioned: true,
      source: 'nexa',
    })
  } catch (error) {
    const status = Number(error?.status || 502)
    const safeStatus = status >= 400 && status < 600 ? status : 502
    const code = String(error?.code || 'nexa_sso_unavailable')
    console.error('[HealthWallet Nexa SSO]', code)
    return json({ success: false, error: code }, safeStatus)
  }
}

export const config = {
  path: '/api/nexa/session',
}
