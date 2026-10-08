import { createClient } from '@supabase/supabase-js'

const denialPattern = /negou|negada|negado|autoriza[cç][aã]o|glosa/i
const reimbursementPattern = /reembolso/i
const humanPattern = /falar com (uma )?pessoa|atendimento humano|concierge humano|enfermeir[ao]/i

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }

  try {
    const token = bearer(req.headers.get('authorization'))
    if (!token) return json(401, { error: 'authentication_required' })

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return json(503, { error: 'concierge_server_not_configured' })
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: authData, error: authError } = await admin.auth.getUser(token)
    const user = authData?.user

    if (authError || !user) {
      return json(401, {
        error: 'invalid_session',
        diagnostic: safeCode(authError?.code || authError?.name || 'user_not_resolved'),
      })
    }

    const body = await req.json().catch(() => ({}))
    const message = String(body?.message || '').trim().slice(0, 5000)
    const source = ['voice', 'whatsapp', 'image', 'document'].includes(body?.source) ? body.source : 'text'
    const channel = body?.channel === 'whatsapp' ? 'whatsapp' : source === 'voice' ? 'voice' : 'text'
    let sessionId = body?.sessionId ? String(body.sessionId) : null

    if (!message) return json(400, { error: 'message_required' })

    const [membershipRes, entitlementRes] = await Promise.all([
      admin
        .from('concierge_memberships')
        .select('patient_id,status,plan_code,consent_status,metadata')
        .eq('patient_id', user.id)
        .maybeSingle(),
      admin
        .from('concierge_entitlements')
        .select('status,plan_code,current_period_end,grace_until')
        .eq('patient_id', user.id)
        .maybeSingle(),
    ])

    if (membershipRes.error || entitlementRes.error) {
      const err = membershipRes.error || entitlementRes.error
      return json(500, {
        error: 'concierge_subscription_lookup_failed',
        diagnostic: safeCode(err?.code || err?.name || 'lookup_failed'),
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
      return json(403, {
        error: 'concierge_subscription_required',
        diagnostic: [
          membership ? null : 'membership_missing',
          entitlementAllowed ? null : 'entitlement_not_allowed',
          membership?.consent_status === 'accepted' ? null : `consent_${membership?.consent_status || 'missing'}`,
          String(membership?.plan_code || entitlement?.plan_code || '').startsWith('concierge') ? null : 'plan_not_concierge',
        ].filter(Boolean).join('+') || 'unknown',
      })
    }

    let session = null

    if (sessionId) {
      const sessionRes = await admin
        .from('concierge_chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('patient_id', user.id)
        .maybeSingle()

      if (sessionRes.error) {
        return json(500, {
          error: 'session_lookup_failed',
          diagnostic: safeCode(sessionRes.error.code || sessionRes.error.name),
        })
      }

      session = sessionRes.data
    }

    if (!session) {
      const sessionRes = await admin
        .from('concierge_chat_sessions')
        .insert({
          patient_id: user.id,
          status: 'ai_active',
          channel,
          metadata: {
            product: 'concierge_digital',
            engine: 'v2',
            plan_code: membership.plan_code,
          },
        })
        .select('*')
        .single()

      if (sessionRes.error || !sessionRes.data) {
        return json(500, {
          error: 'session_create_failed',
          diagnostic: safeCode(sessionRes.error?.code || sessionRes.error?.name || 'no_session'),
        })
      }

      session = sessionRes.data
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
        metadata: { engine: 'v2' },
      })

    if (patientMessageRes.error) {
      return json(500, {
        error: 'message_persist_failed',
        diagnostic: safeCode(patientMessageRes.error.code || patientMessageRes.error.name),
        sessionId,
      })
    }

    const deterministic = buildDeterministicReply(message)
    let createdRequest = null
    let createdOperationalCase = null
    const warnings = []

    if (deterministic.intent === 'create_request') {
      const requestRes = await admin
        .from('concierge_requests')
        .insert({
          patient_id: user.id,
          category: deterministic.request.category,
          title: deterministic.request.title,
          description: deterministic.request.description,
          urgency: deterministic.request.urgency,
          status: 'new',
          context_snapshot: {},
          symptom_payload: {},
          metadata: {
            source_app: 'healthwallet',
            source: 'concierge_digital_v2',
            chat_session_id: sessionId,
            operational_type: deterministic.request.operational_type,
          },
        })
        .select('id,title,status,category,urgency')
        .single()

      if (requestRes.error) {
        warnings.push(`request:${safeCode(requestRes.error.code || requestRes.error.name)}`)
      } else {
        createdRequest = requestRes.data

        const caseRes = await admin
          .from('concierge_operational_cases')
          .insert({
            patient_id: user.id,
            request_id: createdRequest.id,
            chat_session_id: sessionId,
            case_type: deterministic.request.operational_type,
            title: deterministic.request.title,
            description: deterministic.request.description,
            priority: deterministic.request.urgency === 'priority' ? 'high' : 'normal',
            status: deterministic.requiresRepresentation ? 'collecting_docs' : 'new',
            metadata: {
              source: 'concierge_digital_v2',
              representation_required: deterministic.requiresRepresentation,
              representation_ready: false,
            },
          })
          .select('id,case_type,title,status,priority')
          .single()

        if (caseRes.error) {
          warnings.push(`case:${safeCode(caseRes.error.code || caseRes.error.name)}`)
        } else {
          createdOperationalCase = caseRes.data
        }
      }
    }

    const needsHuman = deterministic.needsHuman
    const nextStatus = needsHuman
      ? 'human_requested'
      : deterministic.attention
        ? 'attention'
        : 'ai_active'

    const sessionUpdateRes = await admin
      .from('concierge_chat_sessions')
      .update({
        status: nextStatus,
        attention_reason: deterministic.attention
          ? 'Conversa com potencial complexidade operacional'
          : null,
        human_requested_at: needsHuman ? new Date().toISOString() : session.human_requested_at,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    if (sessionUpdateRes.error) {
      warnings.push(`session_update:${safeCode(sessionUpdateRes.error.code || sessionUpdateRes.error.name)}`)
    }

    const aiMessageRes = await admin
      .from('concierge_chat_messages')
      .insert({
        session_id: sessionId,
        patient_id: user.id,
        actor_role: 'ai',
        source: 'system',
        visibility: 'patient',
        content: deterministic.reply,
        metadata: {
          engine: 'v2',
          mode: 'deterministic_fallback',
          created_request_id: createdRequest?.id || null,
          created_operational_case_id: createdOperationalCase?.id || null,
        },
      })

    if (aiMessageRes.error) {
      warnings.push(`reply_persist:${safeCode(aiMessageRes.error.code || aiMessageRes.error.name)}`)
    }

    return json(200, {
      sessionId,
      status: nextStatus,
      reply: deterministic.reply,
      needsHuman,
      attentionLevel: deterministic.attention ? 'watch' : 'none',
      createdRequest,
      createdOperationalCase,
      aiMode: 'deterministic_fallback',
      warnings,
    })
  } catch (error) {
    return json(500, {
      error: 'concierge_v2_failed',
      diagnostic: safeCode(error?.code || error?.name || 'runtime_error'),
    })
  }
}

function buildDeterministicReply(message) {
  const wantsHuman = humanPattern.test(message)

  if (denialPattern.test(message)) {
    return {
      reply: 'Entendi. Vou organizar essa negativa como um caso do Concierge para acompanharmos protocolo, documentos e o próximo passo com o plano. Se for necessário falar formalmente em seu nome, pediremos a autorização específica dentro desse caso.',
      intent: 'create_request',
      needsHuman: wantsHuman,
      attention: true,
      requiresRepresentation: true,
      request: {
        category: 'navigation',
        title: 'Negativa ou autorização do plano de saúde',
        description: message,
        urgency: 'routine',
        operational_type: 'insurance_authorization',
      },
    }
  }

  if (reimbursementPattern.test(message)) {
    return {
      reply: 'Entendi. Vou organizar o reembolso como um caso acompanhado pelo Concierge e identificar o que falta de documento, protocolo e prazo.',
      intent: 'create_request',
      needsHuman: wantsHuman,
      attention: true,
      requiresRepresentation: true,
      request: {
        category: 'navigation',
        title: 'Reembolso do plano de saúde',
        description: message,
        urgency: 'routine',
        operational_type: 'reimbursement',
      },
    }
  }

  return {
    reply: wantsHuman
      ? 'Certo. Vou avisar a equipe Concierge para entrar na conversa.'
      : 'Recebi sua mensagem. Posso organizar os próximos passos e envolver a equipe humana quando necessário.',
    intent: wantsHuman ? 'human_handoff' : 'conversation',
    needsHuman: wantsHuman,
    attention: false,
    requiresRepresentation: false,
    request: null,
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

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
