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

export default async request => {
  if (request.method !== 'GET') {
    return json({ valid: false, error: 'method_not_allowed' }, 405)
  }

  try {
    const accessToken = bearerToken(request)
    if (!accessToken) return json({ valid: false, error: 'unauthorized' }, 401)

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

    if (!response.ok) {
      return json({ valid: false, error: 'unauthorized' }, 401)
    }

    const user = await response.json().catch(() => ({}))
    const userId = String(user?.id || '').trim()
    if (!userId) return json({ valid: false, error: 'unauthorized' }, 401)

    return json({
      valid: true,
      userId,
      source: 'healthwallet',
    })
  } catch (error) {
    const status = Number(error?.status || 502)
    console.error('[Staff Health session]', String(error?.code || 'session_unavailable'))
    return json(
      { valid: false, error: String(error?.code || 'session_unavailable') },
      status >= 400 && status < 600 ? status : 502,
    )
  }
}

export const config = {
  path: '/api/staff/session',
}
