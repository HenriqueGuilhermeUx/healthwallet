import { createClient } from '@supabase/supabase-js'

const PILOT_PATIENT_ID = '5ed8a3c8-9732-4cc3-97fd-4a234d772135'

export async function handler(event) {
  const host = String(
    event.headers?.host
    || event.headers?.Host
    || event.headers?.['x-forwarded-host']
    || ''
  ).toLowerCase()

  const isPreview = host.includes('deploy-preview-') || host.includes('--healthwallet1.netlify.app')
  if (!isPreview) return json(404, { error: 'not_found' })

  const present = (value) => Boolean(String(value || '').trim())
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  const runtime = {
    supabase_url: present(process.env.SUPABASE_URL),
    vite_supabase_url: present(process.env.VITE_SUPABASE_URL),
    supabase_urls_match: present(process.env.SUPABASE_URL)
      && present(process.env.VITE_SUPABASE_URL)
      && String(process.env.SUPABASE_URL).replace(/\/$/, '') === String(process.env.VITE_SUPABASE_URL).replace(/\/$/, ''),
    supabase_anon_key: present(process.env.SUPABASE_ANON_KEY),
    vite_supabase_anon_key: present(process.env.VITE_SUPABASE_ANON_KEY),
    supabase_secret_key: present(process.env.SUPABASE_SECRET_KEY),
    supabase_service_role_key: present(process.env.SUPABASE_SERVICE_ROLE_KEY),
    openai_api_key: present(process.env.OPENAI_API_KEY),
    concierge_internal_service_key: present(process.env.CONCIERGE_INTERNAL_SERVICE_KEY),
    docwallet_api_url: present(process.env.DOCWALLET_API_URL),
    docwallet_mydatamed_service_key: present(process.env.DOCWALLET_MYDATAMED_SERVICE_KEY),
    context: process.env.CONTEXT || null,
    effective_supabase_url_source: present(process.env.SUPABASE_URL) ? 'SUPABASE_URL' : present(process.env.VITE_SUPABASE_URL) ? 'VITE_SUPABASE_URL' : 'none',
    service_key_source: present(process.env.SUPABASE_SECRET_KEY) ? 'SUPABASE_SECRET_KEY' : present(process.env.SUPABASE_SERVICE_ROLE_KEY) ? 'SUPABASE_SERVICE_ROLE_KEY' : 'none',
  }

  if (!supabaseUrl || !serviceKey) {
    return json(200, { ok: true, runtime, checks: { skipped: 'missing_admin_config' } })
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const [userRes, membershipRes, entitlementRes, sessionRes, messageRes] = await Promise.all([
    admin.auth.admin.getUserById(PILOT_PATIENT_ID),
    admin
      .from('concierge_memberships')
      .select('patient_id,status,plan_code,consent_status')
      .eq('patient_id', PILOT_PATIENT_ID)
      .maybeSingle(),
    admin
      .from('concierge_entitlements')
      .select('patient_id,status,plan_code,current_period_end,grace_until')
      .eq('patient_id', PILOT_PATIENT_ID)
      .maybeSingle(),
    admin
      .from('concierge_chat_sessions')
      .select('id,status,channel,last_activity_at')
      .eq('patient_id', PILOT_PATIENT_ID)
      .order('last_activity_at', { ascending: false })
      .limit(1),
    admin
      .from('concierge_chat_messages')
      .select('id,actor_role,source,created_at')
      .eq('patient_id', PILOT_PATIENT_ID)
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  return json(200, {
    ok: true,
    runtime,
    checks: {
      auth_admin_get_user: summarizeAuth(userRes),
      membership: summarizeRow(membershipRes, ['status','plan_code','consent_status']),
      entitlement: summarizeRow(entitlementRes, ['status','plan_code']),
      sessions: summarizeRows(sessionRes),
      messages: summarizeRows(messageRes),
    },
  })
}

function summarizeAuth(result) {
  return {
    ok: !result?.error,
    has_user: Boolean(result?.data?.user),
    error_code: result?.error?.code || null,
    error_message: result?.error?.message || null,
  }
}

function summarizeRow(result, fields = []) {
  const out = {
    ok: !result?.error,
    has_data: Boolean(result?.data),
    error_code: result?.error?.code || null,
    error_message: result?.error?.message || null,
  }

  for (const field of fields) {
    if (result?.data && Object.prototype.hasOwnProperty.call(result.data, field)) {
      out[field] = result.data[field]
    }
  }

  return out
}

function summarizeRows(result) {
  return {
    ok: !result?.error,
    count: Array.isArray(result?.data) ? result.data.length : 0,
    error_code: result?.error?.code || null,
    error_message: result?.error?.message || null,
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  }
}
