import { createClient } from '@supabase/supabase-js'
import {
  createNexOfficeAddonClient,
  isActiveMyDataMedSubscription,
  resolveMyDataMedAddonIdentity,
} from './_shared/nexoffice-addon.mjs'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function reply(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) }
}

function bearerToken(event) {
  const raw = String(event.headers?.authorization || event.headers?.Authorization || '')
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

function requiredEnv(name, fallbackName = '') {
  const value = String(process.env[name] || (fallbackName ? process.env[fallbackName] : '') || '').trim()
  if (!value) throw Object.assign(new Error(`${name} is required`), { status: 503, code: 'nexoffice_not_configured' })
  return value
}

function bridgeEnabled() {
  return String(process.env.NEXOFFICE_MYDATAMED_ENABLED || '').toLowerCase() === 'true'
}

async function authenticate(event) {
  const token = bearerToken(event)
  if (!token) throw Object.assign(new Error('Authentication required'), { status: 401, code: 'unauthorized' })

  const supabaseUrl = requiredEnv('VITE_SUPABASE_URL', 'SUPABASE_URL')
  const supabaseAnonKey = requiredEnv('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY')
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await supabase.auth.getUser(token)
  const user = data?.user
  if (error || !user?.id || !user?.email) {
    throw Object.assign(new Error('Invalid or expired session'), { status: 401, code: 'unauthorized' })
  }

  return { supabase, user }
}

async function activeSubscription(supabase, userId) {
  const commercial = await supabase
    .from('professional_commercial_subscriptions')
    .select('status,plan_code')
    .eq('professional_user_id', userId)
    .maybeSingle()

  if (!commercial.error && isActiveMyDataMedSubscription(commercial.data)) {
    return commercial.data
  }

  const legacy = await supabase
    .from('professional_subscriptions')
    .select('status,plan_name,clinic_name')
    .eq('professional_user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!legacy.error && isActiveMyDataMedSubscription(legacy.data)) {
    return legacy.data
  }

  return null
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return reply(204, {})
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'method_not_allowed' })

  if (!bridgeEnabled()) {
    return reply(503, { ok: false, error: 'nexoffice_disabled' })
  }

  try {
    const { supabase, user } = await authenticate(event)
    const subscription = await activeSubscription(supabase, user.id)

    if (!subscription) {
      return reply(403, { ok: false, error: 'mydatamed_subscription_required' })
    }

    const identity = resolveMyDataMedAddonIdentity(user, subscription)
    const client = createNexOfficeAddonClient({
      baseUrl: requiredEnv('NEXOFFICE_API_BASE_URL'),
      internalKey: requiredEnv('NEXOFFICE_INTERNAL_KEY'),
      timeoutMs: Number(process.env.NEXOFFICE_TIMEOUT_MS || 12000),
    })

    await client.provision(identity)
    const handoff = await client.handoff(identity)

    if (!handoff?.url || !handoff?.expiresAt) {
      return reply(502, { ok: false, error: 'invalid_nexoffice_handoff' })
    }

    return reply(200, {
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
    return reply(safeStatus, { ok: false, error: code })
  }
}
