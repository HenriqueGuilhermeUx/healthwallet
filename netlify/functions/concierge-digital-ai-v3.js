import { createClient } from '@supabase/supabase-js'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return response(204, null)
  }

  if (event.httpMethod !== 'POST') {
    return response(405, { error: 'method_not_allowed' })
  }

  try {
    const token = bearer(event.headers?.authorization || event.headers?.Authorization)
    if (!token) {
      return response(401, { error: 'authentication_required', stage: 'auth_header' })
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return response(503, { error: 'concierge_server_not_configured', stage: 'runtime_config' })
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: authData, error: authError } = await admin.auth.getUser(token)
    const user = authData?.user

    if (authError || !user) {
      return response(401, {
        error: 'invalid_session',
        stage: 'auth_session',
        code: safeCode(authError?.code || authError?.name || 'user_not_resolved'),
      })
    }

    const body = JSON.parse(event.body || '{}')
    const message = String(body?.message || '').trim().slice(0, 5000)
    const source = body?.source === 'voice' ? 'voice' : 'text'
    let sessionId = body?.sessionId ? String(body.sessionId) : null

    if (!message) {
      return response(400, { error: 'message_required', stage: 'request_validation' })
    }

    const [membershipRes, entitlementRes] = await Promise.all([
      admin
        .from('concierge_memberships')
        .select('patient_id,status,plan_code,consent_status')
        .eq('patient_id', user.id)
        .maybeSingle(),
      admin
        .from('concierge_entitlements')
        .select('patient_id,status,plan_code,current_period_end,grace_until')
        .eq('patient_id', user.id)
        .maybeSingle(),
    ])

    if (membershipRes.error || entitlementRes.error) {
      const err = membershipRes.error || entitlementRes.error
      return response(500, {
        error: 'subscription_lookup_failed',
        stage: 'subscription_lookup',
        code: safeCode(err?.code || err?.name || 'lookup_failed'),
      })
    }

    const membership = membershipRes.data
    const entitlement = entitlementRes.data
    const entitlementAllowed = entitlement
      ? ['trial', 'active', 'grace'].includes(entitlement.status)
      : Boolean(membership && ['pilot', 'active'].includes(membership.status))

    const allowed = Boolean(
      membership
      && entitlementAllowed
      && membership.consent_status === 'accepted'
      && String(membership.plan_code || entitlement?.plan_code || '').startsWith('concierge')
    )

    if (!allowed) {
      return response(403, {
        error: 'concierge_subscription_required',
        stage: 'subscription_gate',
      })
    }

    let session = null

    if (sessionId) {
      const existingRes = await admin
        .from('concierge_chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('patient_id', user.id)
        .maybeSingle()

      if (existingRes.error) {
        return response(500, {
          error: 'session_lookup_failed',
          stage: 'session_lookup',
          code: safeCode(existingRes.error.code || existingRes.error.name),
        })
      }

      session = existingRes.data
    }

    if (!session) {
      const createdRes = await admin
        .from('concierge_chat_sessions')
        .insert({
          patient_id: user.id,
          status: 'ai_active',
          channel: source === 'voice' ? 'voice' : 'text',
          metadata: {
            product: 'concierge_digital',
            engine: 'v3_classic',
          },
        })
        .select('*')
        .single()

      if (createdRes.error || !createdRes.data) {
        return response(500, {
          error: 'session_create_failed',
          stage: 'session_create',
          code: safeCode(createdRes.error?.code || createdRes.error?.name || 'no_session'),
        })
      }

      session = createdRes.data
      sessionId = session.id
    }

    const patientMessageRes = await admin
      .from('concierge_chat_messages')
      .insert({
        session_id: sessionId,
        patient_id: user.id,
        actor_user_id: user.id,
        actor_role: 'patient',
        source,
        visibility: 'patient',
        content: message,
        metadata: { engine: 'v3_classic' },
      })

    if (patientMessageRes.error) {
      return response(500, {
        error: 'message_persist_failed',
        stage: 'message_persist',
        code: safeCode(patientMessageRes.error.code || patientMessageRes.error.name),
      })
    }

    const reply = /negou|negada|negado|autoriza[cç][aã]o|glosa/i.test(message)
      ? 'Entendi. Vou organizar essa negativa como um caso do Concierge. Primeiro confirmamos que a conversa e a persistência estão funcionando; em seguida eu ativo a abertura automática do caso operacional.'
      : 'Recebi sua mensagem. O Concierge está funcionando no novo motor de teste.'

    const aiMessageRes = await admin
      .from('concierge_chat_messages')
      .insert({
        session_id: sessionId,
        patient_id: user.id,
        actor_role: 'ai',
        source: 'system',
        visibility: 'patient',
        content: reply,
        metadata: { engine: 'v3_classic', mode: 'deterministic' },
      })

    if (aiMessageRes.error) {
      return response(500, {
        error: 'reply_persist_failed',
        stage: 'reply_persist',
        code: safeCode(aiMessageRes.error.code || aiMessageRes.error.name),
        sessionId,
      })
    }

    await admin
      .from('concierge_chat_sessions')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', sessionId)

    return response(200, {
      sessionId,
      status: 'ai_active',
      reply,
      needsHuman: false,
      attentionLevel: 'none',
      createdRequest: null,
      createdOperationalCase: null,
      aiMode: 'v3_classic_deterministic',
    })
  } catch (error) {
    return response(500, {
      error: 'concierge_v3_failed',
      stage: 'runtime',
      code: safeCode(error?.code || error?.name || 'runtime_error'),
    })
  }
}

function bearer(value) {
  const match = String(value || '').match(/^Bearer\s+(.+)$/i)
  return match?.[1] || null
}

function safeCode(value) {
  return String(value || 'unknown')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .slice(0, 80)
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: body == null ? '' : JSON.stringify(body),
  }
}
