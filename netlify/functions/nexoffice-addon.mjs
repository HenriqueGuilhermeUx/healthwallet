import {
  createNexOfficeAddonClient,
  isActiveMyDataMedSubscription,
  resolveMyDataMedAddonIdentity,
} from './_shared/nexoffice-addon.mjs'

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

function requiredEnv(name, fallbackName = '') {
  const value = env(name) || (fallbackName ? env(fallbackName) : '')
  if (!value) {
    throw Object.assign(new Error(`${name} is required`), {
      status: 503,
      code: 'nexoffice_not_configured',
    })
  }
  return value
}

function bridgeEnabled() {
  return env('NEXOFFICE_MYDATAMED_ENABLED').toLowerCase() === 'true'
}

function bearerToken(request) {
  const raw = String(request.headers.get('authorization') || '')
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

async function authenticate(request) {
  const token = bearerToken(request)
  if (!token) {
    throw Object.assign(new Error('Authentication required'), {
      status: 401,
      code: 'unauthorized',
    })
  }

  const supabaseUrl = requiredEnv('VITE_SUPABASE_URL', 'SUPABASE_URL').replace(/\/$/, '')
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY')

  let response
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    throw Object.assign(new Error('Authentication service unavailable'), {
      status: 503,
      code: 'auth_unavailable',
    })
  }

  if (!response.ok) {
    throw Object.assign(new Error('Invalid or expired session'), {
      status: 401,
      code: 'unauthorized',
    })
  }

  const user = await response.json().catch(() => null)
  if (!user?.id || !user?.email) {
    throw Object.assign(new Error('Invalid or expired session'), {
      status: 401,
      code: 'unauthorized',
    })
  }

  return { token, supabaseUrl, anonKey, user }
}

async function selectOwnSubscription({ supabaseUrl, anonKey, token, userId, table, columns }) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`)
  url.searchParams.set('select', columns)
  url.searchParams.set('professional_user_id', `eq.${userId}`)
  url.searchParams.set('limit', '1')

  try {
    const response = await fetch(url, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return null
    const rows = await response.json().catch(() => [])
    return Array.isArray(rows) ? rows[0] || null : null
  } catch {
    return null
  }
}

async function activeSubscription(auth) {
  const commercial = await selectOwnSubscription({
    ...auth,
    userId: auth.user.id,
    table: 'professional_commercial_subscriptions',
    columns: 'status,plan_code',
  })

  if (isActiveMyDataMedSubscription(commercial)) return commercial

  const legacy = await selectOwnSubscription({
    ...auth,
    userId: auth.user.id,
    table: 'professional_subscriptions',
    columns: 'status,plan_name,clinic_name',
  })

  return isActiveMyDataMedSubscription(legacy) ? legacy : null
}

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  try {
    if (!bridgeEnabled()) {
      return json({ ok: false, error: 'nexoffice_disabled' }, 503)
    }

    const auth = await authenticate(request)
    const subscription = await activeSubscription(auth)

    if (!subscription) {
      return json({ ok: false, error: 'mydatamed_subscription_required' }, 403)
    }

    const identity = resolveMyDataMedAddonIdentity(auth.user, subscription)
    const client = createNexOfficeAddonClient({
      baseUrl: requiredEnv('NEXOFFICE_API_BASE_URL'),
      internalKey: requiredEnv('NEXOFFICE_INTERNAL_KEY'),
      timeoutMs: Number(env('NEXOFFICE_TIMEOUT_MS') || 12000),
    })

    await client.provision(identity)
    const handoff = await client.handoff(identity)

    if (!handoff?.url || !handoff?.expiresAt) {
      return json({ ok: false, error: 'invalid_nexoffice_handoff' }, 502)
    }

    return json({
      ok: true,
      url: handoff.url,
      expiresAt: handoff.expiresAt,
      includedWithMyDataMed: true,
    })
  } catch (error) {
    const status = Number(error?.status || 502)
    const safeStatus = status >= 400 && status < 600 ? status : 502
    const code = String(error?.code || error?.message || 'nexoffice_unavailable')
    console.error('[MyDataMed NexOffice Add-on]', code)
    return json({ ok: false, error: code }, safeStatus)
  }
}

export const config = {
  path: '/api/nexoffice/handoff',
}
