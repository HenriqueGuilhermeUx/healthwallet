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

function supabaseServiceHeaders(secret) {
  const headers = {
    apikey: secret,
    accept: 'application/json',
  }

  if (!secret.startsWith('sb_secret_')) {
    headers.authorization = `Bearer ${secret}`
  }

  return headers
}

function isEnabled() {
  return env('NEXA_ECOSYSTEM_ATTENTION_ENABLED').toLowerCase() === 'true'
}

async function authorize(request, nexaUserId) {
  const token = bearerToken(request)
  if (!token) {
    throw Object.assign(new Error('Unauthorized'), {
      status: 401,
      code: 'unauthorized',
    })
  }

  const nexaApiUrl = requiredEnv('NEXA_API_URL').replace(/\/$/, '')
  const response = await fetch(`${nexaApiUrl}/staff/validate-token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(7_000),
  })

  const payload = await response.json().catch(() => ({}))
  const validatedUserId = String(
    payload?.user?.userId || payload?.user?.id || payload?.user?.sub || '',
  ).trim()

  if (!response.ok || payload?.valid !== true || validatedUserId !== nexaUserId) {
    throw Object.assign(new Error('Unauthorized'), {
      status: 401,
      code: 'unauthorized',
    })
  }
}

function safeNexaUserId(request) {
  const value = String(request.headers.get('x-nexa-user-id') || '').trim()
  if (!value || value.length > 120) {
    throw Object.assign(new Error('Nexa user ID is required'), {
      status: 400,
      code: 'invalid_identity',
    })
  }
  return value
}

async function supabaseRest({ baseUrl, serviceRole, table, params }) {
  const url = new URL(`${baseUrl}/rest/v1/${table}`)
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  const response = await fetch(url, {
    headers: supabaseServiceHeaders(serviceRole),
    signal: AbortSignal.timeout(7_000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw Object.assign(new Error(`Supabase query failed: ${response.status} ${text.slice(0, 120)}`), {
      status: 502,
      code: 'health_data_unavailable',
    })
  }

  const data = await response.json().catch(() => [])
  return Array.isArray(data) ? data : []
}

async function findHealthUserId(baseUrl, serviceRole, nexaUserId) {
  for (let page = 1; page <= 5; page += 1) {
    const url = new URL(`${baseUrl}/auth/v1/admin/users`)
    url.searchParams.set('page', String(page))
    url.searchParams.set('per_page', '200')

    const response = await fetch(url, {
      headers: supabaseServiceHeaders(serviceRole),
      signal: AbortSignal.timeout(7_000),
    })

    if (!response.ok) return ''

    const payload = await response.json().catch(() => ({}))
    const users = Array.isArray(payload?.users) ? payload.users : []
    const match = users.find(
      user =>
        String(user?.user_metadata?.nexa_user_id || '').trim() === nexaUserId,
    )
    if (match?.id) return String(match.id)
    if (users.length < 200) break
  }

  return ''
}

function appointmentDueAt(item) {
  if (item?.scheduled_at) return String(item.scheduled_at)

  const date = String(item?.preferred_date || '').trim()
  if (!date) return null
  const time = String(item?.preferred_time || '09:00:00').trim()
  return `${date}T${time}`
}

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (request.method !== 'GET') {
    return json({ success: false, error: 'method_not_allowed' }, 405)
  }

  try {
    if (!isEnabled()) {
      return json({
        success: true,
        enabled: false,
        items: [],
        sensitivePayloadIncluded: false,
      })
    }

    const nexaUserId = safeNexaUserId(request)
    await authorize(request, nexaUserId)
    const baseUrl = requiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/$/, '')
    const serviceRole = env('SUPABASE_SECRET_KEY') || requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const today = new Date().toISOString().slice(0, 10)

    const userId = await findHealthUserId(baseUrl, serviceRole, nexaUserId).catch(() => '')

    const appointmentRows = userId
      ? await supabaseRest({
          baseUrl,
          serviceRole,
          table: 'telemedicine_appointments',
          params: {
            select: 'id,preferred_date,preferred_time,scheduled_at,status',
            or: `(user_id.eq.${userId},patient_id.eq.${userId})`,
            status: 'in.(requested,scheduled,confirmed,reminder_sent)',
            preferred_date: `gte.${today}`,
            order: 'preferred_date.asc,preferred_time.asc',
            limit: '1',
          },
        }).catch(() => [])
      : []

    const inboxRows = userId
      ? await supabaseRest({
          baseUrl,
          serviceRole,
          table: 'health_document_inbox',
          params: {
            select: 'id,received_at',
            user_id: `eq.${userId}`,
            status: 'eq.pending_review',
            order: 'received_at.desc',
            limit: '20',
          },
        }).catch(() => [])
      : []

    const items = []

    const nextAppointment = appointmentRows[0]
    if (nextAppointment) {
      items.push({
        id: `health-appointment-${nextAppointment.id}`,
        kind: 'health.appointment.upcoming',
        title: 'Consulta próxima',
        summary: 'Você tem uma consulta agendada. Abra o Health Wallet para ver os detalhes.',
        dueAt: appointmentDueAt(nextAppointment),
        count: 1,
      })
    }

    if (inboxRows.length > 0) {
      items.push({
        id: 'health-document-pending-review',
        kind: 'health.document.pending_review',
        title: 'Novo documento de saúde',
        summary:
          inboxRows.length === 1
            ? 'Há 1 item aguardando sua revisão no Health Wallet.'
            : `Há ${inboxRows.length} itens aguardando sua revisão no Health Wallet.`,
        dueAt: inboxRows[0]?.received_at || null,
        count: inboxRows.length,
      })
    }

    return json({
      success: true,
      enabled: true,
      source: 'healthwallet',
      mode: 'read_only_minimum_context',
      items,
      sensitivePayloadIncluded: false,
    })
  } catch (error) {
    const status = Number(error?.status || 502)
    const safeStatus = status >= 400 && status < 600 ? status : 502
    const code = String(error?.code || 'health_attention_unavailable')
    console.error('[Nexa Attention HealthWallet]', code)
    return json({ success: false, error: code }, safeStatus)
  }
}

export const config = {
  path: '/api/nexa/attention',
}
