import { createClient } from '@supabase/supabase-js'
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

function requiredEnv(name, fallbackName = '') {
  const value = String(Netlify.env.get(name) || (fallbackName ? Netlify.env.get(fallbackName) : '') || '').trim()
  if (!value) {
    throw Object.assign(new Error(`${name} is required`), {
      status: 503,
      code: 'nexoffice_not_configured',
    })
  }
  return value
}

function bridgeEnabled() {
  return String(Netlify.env.get('NEXOFFICE_MYDATAMED_ENABLED') || '').toLowerCase() === 'true'
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

  const supabaseUrl = requiredEnv('VITE_SUPABASE_URL', 'SUPABASE_URL')
  const supabaseAnonKey = requiredEnv('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY')
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await supabase.auth.getUser(token)
  const user = data?.user
  if (error || !user?.id || !user?.email) {
    throw Object.assign(new Error('Invalid or expired session'), {
      status: 401,
      code: 'unauthorized',
    })
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

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  if (!bridgeEnabled()) {
    return json({ ok: false, error: 'nexoffice_disabled' }, 503)
  }

  try {
    const { supabase, user } = await authenticate(request)
    const subscription = await activeSubscription(supabase, user.id)

    if (!subscription) {
      return json({ ok: false, error: 'mydatamed_subscription_required' }, 403)
    }

    const identity = resolveMyDataMedAddonIdentity(user, subscription)
    const client = createNexOfficeAddonClient({
      baseUrl: requiredEnv('NEXOFFICE_API_BASE_URL'),
      internalKey: requiredEnv('NEXOFFICE_INTERNAL_KEY'),
      timeoutMs: Number(Netlify.env.get('NEXOFFICE_TIMEOUT_MS') || 12000),
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
