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

function isEnabled() {
  return env('NEXA_ECOSYSTEM_ATTENTION_ENABLED').toLowerCase() === 'true'
}

function authorize(request) {
  const expected = env('NEXA_ECOSYSTEM_ATTENTION_SERVICE_KEY')
  const provided = bearerToken(request)

  if (!expected || !provided || provided !== expected) {
    throw Object.assign(new Error('Unauthorized'), {
      status: 401,
      code: 'unauthorized',
    })
  }
}

function safeEmail(request) {
  const value = String(request.headers.get('x-nexa-user-email') || '').trim().toLowerCase()
  if (!value || value.length > 254 || !value.includes('@')) {
    throw Object.assign(new Error('Nexa user email is required'), {
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
    headers: {
      apikey: serviceRole,
      authorization: `Bearer ${serviceRole}`,
      accept: 'application/json',
    },
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

async function findHealthUserId(baseUrl, serviceRole, email) {
  // Prefer the app-level users mirror when present. This avoids exporting any
  // auth metadata and keeps the Nexa bridge limited to a stable internal UUID.
  try {
    const rows = await supabaseRest({
      baseUrl,
      serviceRole,
      table: 'users',
      params: {
        select: 'id',
        email: `eq.${email}`,
        limit: '1',
      },
    })
    if (rows[0]?.id) return String(rows[0].id)
  } catch {
    // Some older Health Wallet deployments do not maintain public.users.
  }

  // Compatibility fallback for older deployments: use Supabase Admin only to
  // resolve the UUID, never returning auth metadata to Nexa.
  const url = new URL(`${baseUrl}/auth/v1/admin/users`)
  url.searchParams.set('page', '1')
  url.searchParams.set('per_page', '1000')

  const response = await fetch(url, {
    headers: {
      apikey: serviceRole,
      authorization: `Bearer ${serviceRole}`,
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(7_000),
  })

  if (!response.ok) return ''

  const payload = await response.json().catch(() => ({}))
  const users = Array.isArray(payload?.users) ? payload.users : []
  const match = users.find(
    user => String(user?.email || '').trim().toLowerCase() === email,
  )
  return match?.id ? String(match.id) : ''
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

    authorize(request)
    const email = safeEmail(request)
    const baseUrl = requiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/$/, '')
    const serviceRole = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const today = new Date().toISOString().slice(0, 10)

    const appointmentRows = await supabaseRest({
      baseUrl,
      serviceRole,
      table: 'telemedicine_appointments',
      params: {
        select: 'id,preferred_date,preferred_time,scheduled_at,status',
        patient_email: `ilike.${email}`,
        status: 'in.(requested,scheduled,confirmed,reminder_sent)',
        preferred_date: `gte.${today}`,
        order: 'preferred_date.asc,preferred_time.asc',
        limit: '1',
      },
    }).catch(() => [])

    const userId = await findHealthUserId(baseUrl, serviceRole, email).catch(() => '')
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
