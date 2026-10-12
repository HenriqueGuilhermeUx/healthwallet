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

function bearerToken(request) {
  const raw = String(request.headers.get('authorization') || '')
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
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

async function validateSession(accessToken) {
  const supabaseUrl = requiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/$/, '')
  const publicKey =
    env('SUPABASE_PUBLISHABLE_KEY') ||
    env('VITE_SUPABASE_PUBLISHABLE_KEY') ||
    requiredEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: publicKey,
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(8_000),
  })

  if (!response.ok) return null
  const user = await response.json().catch(() => ({}))
  return user?.id ? user : null
}

export default async request => {
  if (request.method !== 'POST') {
    return json({ success: false, error: 'method_not_allowed' }, 405)
  }

  try {
    const accessToken = bearerToken(request)
    if (!accessToken) return json({ success: false, error: 'unauthorized' }, 401)

    const user = await validateSession(accessToken)
    if (!user?.id) return json({ success: false, error: 'unauthorized' }, 401)

    const body = await request.json().catch(() => ({}))
    const capability = String(body?.capability || '').trim()
    const message = String(body?.message || '').trim().slice(0, 4000)
    const consent = body?.consent === true

    if (capability !== 'web.appointment.search') {
      return json({ success: false, error: 'unsupported_scope' }, 403)
    }
    if (!message) {
      return json({ success: false, error: 'message_required' }, 400)
    }

    const staffUrl =
      env('STAFF_CAPABILITIES_URL') ||
      'https://app.smartbots.club/.netlify/functions/staff-capabilities'

    const response = await fetch(staffUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'x-staff-source': 'healthwallet',
        'x-staff-subject': String(user.id),
      },
      body: JSON.stringify({
        capability: 'web.appointment.search',
        message,
        consent,
      }),
      signal: AbortSignal.timeout(55_000),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      return json(
        {
          success: false,
          error: String(payload?.error || 'staff_capability_unavailable'),
        },
        response.status,
      )
    }

    return json({
      success: true,
      handled: payload?.handled === true,
      status: payload?.status || null,
      confirmationKind: payload?.confirmationKind || null,
      response: String(payload?.response || ''),
      options: Array.isArray(payload?.options) ? payload.options.slice(0, 5) : [],
      privacy: {
        persistedInStaff: false,
        clinicalContextIncluded: false,
      },
    })
  } catch (error) {
    const code = String(error?.code || 'staff_capability_unavailable')
    console.error('[Health Staff capability]', code)
    return json({ success: false, error: code }, Number(error?.status || 502))
  }
}

export const config = {
  path: '/api/staff/capabilities',
}
