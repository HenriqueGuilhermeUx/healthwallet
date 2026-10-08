import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const URGENT_PATTERNS = [
  /dor (muito )?forte no peito/i,
  /falta de ar (intensa|forte|muito)/i,
  /não consigo respirar/i,
  /desmaiei|desmaio/i,
  /convuls[aã]o/i,
  /sangramento (intenso|muito)/i,
  /paralisia|boca torta|fala enrolada/i,
]

const SYSTEM_INSTRUCTIONS = `
Você é o Concierge Digital da HealthWallet/MyDataMed.

Seu papel é COORDENAR a jornada de saúde do paciente: organizar próximos passos, explicar o estado operacional de demandas, ajudar a preparar perguntas, entender o que a pessoa quer resolver e encaminhar para a equipe humana quando necessário.

Você NÃO é médico e NÃO deve:
- diagnosticar;
- prescrever, suspender ou alterar medicamentos;
- substituir avaliação médica;
- afirmar que um exame/consulta foi marcado se os dados não confirmarem;
- esconder incerteza;
- aconselhar o usuário a esperar pelo Concierge em situações potencialmente graves.

Você pode:
- conversar de forma natural e acolhedora;
- responder dúvidas regulatórias administrativas APENAS com base nos playbooks regulatórios fornecidos no contexto;
- explicar direitos e procedimentos em linguagem simples, deixando claro quando a regra depende de contrato, cobertura, carência, abrangência ou documentação;
- oferecer transformar a dúvida em um caso operacional rastreável;
- usar o contexto fornecido para evitar perguntas repetidas;
- identificar intenção administrativa;
- sugerir criação de uma solicitação Concierge quando há algo concreto a resolver;
- pedir transbordo humano;
- indicar necessidade de atenção da equipe;
- dizer claramente o que já está pendente/agendado.

Quando o paciente pedir explicitamente uma pessoa, atendimento humano, enfermeira, concierge ou "quero falar com alguém", needs_human deve ser true.

Retorne SOMENTE JSON válido:
{
  "reply": "resposta curta, clara e conversacional em português do Brasil",
  "intent": "conversation|create_request|human_handoff|status|attention",
  "needs_human": false,
  "attention_level": "none|watch|high",
  "attention_reason": null,
  "request": null
}

Se intent=create_request, request deve ser:
{
  "category": "symptom|guidance|exam_review|second_analysis|medication_review|navigation|other",
  "title": "título curto",
  "description": "descrição objetiva do que precisa ser resolvido",
  "urgency": "routine|priority",
  "operational_type": "provider_search|scheduling|insurance_authorization|reimbursement|claim_denial|hospitalization|surgery|complex_case|caregiver_coordination|general_navigation",
  "insurer_name": null,
  "plan_name": null,
  "protocol_number": null,
  "amount_requested": null,
  "legal_guide_code": null
}

Use create_request somente quando o paciente estiver efetivamente pedindo uma ação/coordenação concreta.

Sinais para attention_level:
- "watch": conversa repetitiva, frustração, bloqueio operacional, idoso/familiar dependente, dificuldade com plano, autorização, reembolso ou acesso;
- "high": internação, cirurgia próxima, caso oncológico/complexo, glosa que ameaça continuidade, sofrimento emocional importante, ou situação em que a equipe humana deveria enxergar logo mesmo sem pedido explícito.
Não transforme attention em decisão clínica. É um sinal operacional para a equipe Concierge.

LIMITES JURÍDICOS:
- Você pode informar regras regulatórias gerais e procedimentos administrativos baseados nos playbooks fornecidos.
- Não dê parecer jurídico individualizado, não prometa cobertura/reembolso/resultado e não diga que uma negativa é "ilegal" sem análise humana adequada.
- Não redija conteúdo clínico em nome de médico. Pode apontar ausência formal e pedir que o profissional assistente complemente.
- Judicialização, liminar, estratégia processual ou interpretação jurídica controversa devem ser encaminhadas a advogado.
- Para NIP, nunca prometa resolução em 48 horas; siga o playbook atual.
`

export async function handler(event) {
  let failureStage = 'bootstrap'
  let providerDiagnostic = null

  if (event.httpMethod === 'OPTIONS') {
    return response(204, null)
  }

  if (event.httpMethod !== 'POST') {
    return response(405, { error: 'method_not_allowed' })
  }

  try {
    failureStage = 'request_validation'
    const rawBody = JSON.parse(event.body || '{}')
    const internalKey = String(event.headers?.['x-concierge-internal-key'] || event.headers?.['X-Concierge-Internal-Key'] || '')
    const configuredInternalKey = String(process.env.CONCIERGE_INTERNAL_SERVICE_KEY || '')
    const internalTrusted = safeEqual(internalKey, configuredInternalKey)

    const token = bearer(event.headers?.authorization || event.headers?.Authorization)
    if (!token && !internalTrusted) return response(401, { error: 'authentication_required' })

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    const openaiKey = process.env.OPENAI_API_KEY

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return response(503, { error: 'concierge_server_not_configured' })
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    let user = null
    if (internalTrusted) {
      const patientId = String(rawBody.patientId || '').trim()
      if (!patientId) return response(400, { error: 'patient_id_required' })
      user = { id: patientId }
    } else {
      const { data: authData, error: authError } = await userClient.auth.getUser(token)
      user = authData?.user
      if (authError || !user) return response(401, { error: 'invalid_session' })
    }

    const body = rawBody
    const message = String(body.message || '').trim().slice(0, 5000)
    const source = ['voice','whatsapp','image','document'].includes(body.source) ? body.source : 'text'
    const interactionChannel = body.channel === 'whatsapp'
      ? 'whatsapp'
      : source === 'voice'
        ? 'voice'
        : 'text'
    const requestedSubjectFamilyMemberId = body.subjectFamilyMemberId ? String(body.subjectFamilyMemberId) : null
    let sessionId = body.sessionId ? String(body.sessionId) : null

    if (!message) return response(400, { error: 'message_required' })

    failureStage = 'subscription_lookup'
    const [{ data: membership }, { data: entitlement }, { data: representationAuth }] = await Promise.all([
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
      admin
        .from('concierge_legal_authorizations')
        .select('authorization_type,status')
        .eq('patient_id', user.id)
        .in('authorization_type', ['representation_authorization','combined_onboarding'])
        .eq('status', 'signed')
        .limit(1)
        .maybeSingle(),
    ])

    const entitlementAllowed = entitlement
      ? ['trial','active','grace'].includes(entitlement.status)
      : Boolean(membership && ['pilot','active'].includes(membership.status))

    const allowed =
      membership
      && entitlementAllowed
      && membership.consent_status === 'accepted'
      && String(membership.plan_code || entitlement?.plan_code || '').startsWith('concierge')

    if (!allowed) {
      return response(403, { error: 'concierge_subscription_required' })
    }

    let subjectFamilyMember = null
    if (requestedSubjectFamilyMemberId) {
      const { data: familyRow } = await admin
        .from('family_members')
        .select('id,name,relationship,member_type,birth_date,health_plan,is_elderly,conditions,care_notes')
        .eq('id', requestedSubjectFamilyMemberId)
        .eq('user_id', user.id)
        .maybeSingle()
      subjectFamilyMember = familyRow || null
    }

    let session = null

    failureStage = 'session_lookup'
    if (sessionId) {
      const { data } = await admin
        .from('concierge_chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('patient_id', user.id)
        .maybeSingle()
      session = data
    }

    if (!session) {
      failureStage = 'session_create'
      const { data, error } = await admin
        .from('concierge_chat_sessions')
        .insert({
          patient_id: user.id,
          status: 'ai_active',
          channel: interactionChannel,
          metadata: {
            product: 'concierge_digital',
            plan_code: membership.plan_code,
            subject_family_member_id: subjectFamilyMember?.id || null,
            subject_name: subjectFamilyMember?.name || null,
            subject_relationship: subjectFamilyMember?.relationship || null,
          },
        })
        .select('*')
        .single()

      if (error) throw error
      session = data
      sessionId = data.id
    }

    failureStage = 'message_persist'
    await admin.from('concierge_chat_messages').insert({
      session_id: sessionId,
      patient_id: user.id,
      actor_user_id: user.id,
      actor_role: 'patient',
      source,
      visibility: 'patient',
      content: message,
      metadata: {},
    })

    await admin
      .from('concierge_chat_sessions')
      .update({
        last_activity_at: new Date().toISOString(),
        channel: session.channel === interactionChannel ? session.channel : session.channel === 'whatsapp' || interactionChannel === 'whatsapp' ? 'whatsapp' : 'mixed',
      })
      .eq('id', sessionId)

    if (['human_requested', 'human_active'].includes(session.status)) {
      return response(200, {
        sessionId,
        status: session.status,
        humanActive: true,
        reply: null,
      })
    }

    const urgent = URGENT_PATTERNS.some((pattern) => pattern.test(message))
    if (urgent) {
      const urgentReply =
        'Pelo que você descreveu, isso pode precisar de avaliação imediata. Não espere uma resposta do Concierge: procure um serviço de urgência da sua região ou acione o serviço de emergência local. Também avisei sua equipe Concierge para acompanhamento.'

      await admin
        .from('concierge_chat_sessions')
        .update({
          status: 'attention',
          attention_reason: 'Possível sinal de urgência relatado pelo paciente',
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', sessionId)

      await admin.from('concierge_chat_messages').insert({
        session_id: sessionId,
        patient_id: user.id,
        actor_role: 'ai',
        source: 'system',
        visibility: 'patient',
        content: urgentReply,
        metadata: { urgent_redirect: true },
      })

      return response(200, {
        sessionId,
        status: 'attention',
        urgent: true,
        reply: urgentReply,
      })
    }

    if (!openaiKey) {
      const fallback =
        'Recebi sua mensagem e registrei sua conversa. A inteligência do Concierge está temporariamente indisponível, mas você pode pedir atendimento humano a qualquer momento.'

      await admin.from('concierge_chat_messages').insert({
        session_id: sessionId,
        patient_id: user.id,
        actor_role: 'ai',
        source: 'system',
        visibility: 'patient',
        content: fallback,
        metadata: { fallback: true },
      })

      return response(200, { sessionId, status: 'ai_active', reply: fallback })
    }

    const [profileRes, scoreRes, actionsRes, requestsRes, coordinationRes, historyRes, regulatoryGuidesRes, regulatoryPlaybooksRes] = await Promise.all([
      admin.from('profiles').select('id,full_name,name').eq('id', user.id).maybeSingle(),
      admin.from('health_scores').select('score,status,calculated_at').eq('user_id', user.id).order('calculated_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('concierge_actions').select('id,title,status,due_date').eq('patient_id', user.id).in('status', ['pending','in_progress']).order('due_date', { ascending: true, nullsFirst: false }).limit(8),
      admin.from('concierge_requests').select('id,title,status,urgency,category,created_at').eq('patient_id', user.id).not('status', 'in', '(closed,resolved)').order('created_at', { ascending: false }).limit(8),
      admin.from('concierge_external_tasks').select('id,title,status,provider_name,scheduled_at,preparation_instructions').eq('patient_id', user.id).not('status', 'in', '(closed,cancelled)').order('created_at', { ascending: false }).limit(8),
      admin.from('concierge_chat_messages').select('actor_role,content,created_at,visibility').eq('session_id', sessionId).eq('visibility', 'patient').order('created_at', { ascending: false }).limit(16),
      admin.from('concierge_regulatory_guides').select('guide_code,topic,question,patient_answer,legal_boundary,source_refs,metadata').eq('active', true).limit(30),
      admin.from('concierge_regulatory_playbooks').select('rule_code,title,authority,version_label,service_type,max_business_days,escalation_action,metadata').eq('active', true).limit(50),
    ])

    const history = (historyRes.data || []).reverse().map((item) => ({
      role: item.actor_role === 'patient' ? 'user' : 'assistant',
      content: item.content,
    }))

    const context = {
      patient_name:
        profileRes.data?.full_name
        || profileRes.data?.name
        || membership.metadata?.patient_name
        || null,
      health_score: scoreRes.data || null,
      open_actions: actionsRes.data || [],
      open_requests: requestsRes.data || [],
      active_coordination: coordinationRes.data || [],
      regulatory_guides: regulatoryGuidesRes.data || [],
      regulatory_deadlines: regulatoryPlaybooksRes.data || [],
      legal_readiness: {
        representation_authorized: Boolean(representationAuth),
        note: representationAuth
          ? 'Representação administrativa autorizada.'
          : 'O paciente ainda não concluiu autorização para atuação em seu nome perante operadoras/órgãos. A conversa e organização podem continuar, mas a equipe deve solicitar assinatura antes de representar o paciente.',
      },
      conversation_subject: subjectFamilyMember ? {
        type: 'family_member',
        id: subjectFamilyMember.id,
        name: subjectFamilyMember.name,
        relationship: subjectFamilyMember.relationship,
        member_type: subjectFamilyMember.member_type,
        birth_date: subjectFamilyMember.birth_date,
        health_plan: subjectFamilyMember.health_plan,
        is_elderly: subjectFamilyMember.is_elderly,
        conditions: subjectFamilyMember.conditions,
        care_notes: subjectFamilyMember.care_notes,
      } : {
        type: 'self',
        name: profileRes.data?.full_name || profileRes.data?.name || membership.metadata?.patient_name || null,
      },
    }

    failureStage = 'ai_provider'
    const aiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.CONCIERGE_AI_MODEL || 'gpt-6-luna',
        instructions: SYSTEM_INSTRUCTIONS,
        input: [
          {
            role: 'user',
            content:
              'Contexto operacional atual do paciente:\n'
              + JSON.stringify(context)
              + '\n\nHistórico recente da conversa:\n'
              + JSON.stringify(history)
              + '\n\nMensagem atual:\n'
              + message,
          },
        ],
      }),
    })

    const aiJson = await aiRes.json().catch(() => ({}))
    let parsed
    let aiMode = 'primary'

    if (!aiRes.ok) {
      const providerCode = String(aiJson?.error?.code || aiJson?.error?.type || 'provider_error').slice(0, 80)
      providerDiagnostic = {
        status: aiRes.status,
        code: providerCode,
      }
      console.error('Concierge AI provider unavailable:', providerDiagnostic)
      parsed = deterministicFallback(message)
      aiMode = 'fallback'
    } else {
      parsed = parseAI(extractResponseText(aiJson))
    }
    const reply = String(parsed.reply || 'Entendi. Vou acompanhar isso com você.').slice(0, 6000)

    failureStage = 'operational_processing'
    let createdRequest = null
    let createdOperationalCase = null
    if (parsed.intent === 'create_request' && parsed.request) {
      const requestInput = parsed.request
      const safeCategories = ['symptom','guidance','exam_review','second_analysis','medication_review','navigation','other']
      const category = safeCategories.includes(requestInput.category) ? requestInput.category : 'other'
      const urgency = requestInput.urgency === 'priority' ? 'priority' : 'routine'
      const operationalType = String(requestInput.operational_type || 'general_navigation')
      const allowedOperationalTypes = new Set([
        'provider_search','scheduling','insurance_authorization','reimbursement','claim_denial',
        'hospitalization','surgery','complex_case','caregiver_coordination','general_navigation',
      ])
      const safeOperationalType = allowedOperationalTypes.has(operationalType) ? operationalType : 'general_navigation'
      const requiresRepresentation = new Set([
        'insurance_authorization','reimbursement','claim_denial','hospitalization','surgery','complex_case',
      ]).has(safeOperationalType)

      const { data } = await admin
        .from('concierge_requests')
        .insert({
          patient_id: user.id,
          category,
          title: String(requestInput.title || 'Solicitação do Concierge Digital').slice(0, 180),
          description: String(requestInput.description || message).slice(0, 5000),
          urgency,
          status: 'new',
          subject_name: subjectFamilyMember?.name || null,
          subject_relationship: subjectFamilyMember?.relationship || null,
          subject_family_member_id: subjectFamilyMember?.id || null,
          context_snapshot: {},
          symptom_payload: {},
          metadata: {
            source_app: 'healthwallet',
            source: 'concierge_digital_ai',
            chat_session_id: sessionId,
            operational_type: safeOperationalType,
            caregiver_mode: Boolean(subjectFamilyMember),
          },
        })
        .select('id,title,status,category,urgency')
        .single()

      createdRequest = data || null

      if (createdRequest) {
        await admin.from('concierge_request_events').insert({
          request_id: createdRequest.id,
          patient_id: user.id,
          actor_user_id: user.id,
          actor_role: 'patient',
          event_type: 'request_created_from_digital_concierge',
          visibility: 'patient',
          message: 'O Concierge Digital abriu esta solicitação para acompanhamento da equipe.',
          payload: {
            chat_session_id: sessionId,
            operational_type: safeOperationalType,
            subject_family_member_id: subjectFamilyMember?.id || null,
          },
        })

        try {
          const highComplexity = new Set([
            'insurance_authorization','reimbursement','claim_denial','hospitalization',
            'surgery','complex_case','caregiver_coordination',
          ])
          const amountRaw = Number(requestInput.amount_requested)
          const amountRequested = Number.isFinite(amountRaw) && amountRaw >= 0 ? amountRaw : null

          const { data: caseRow, error: caseError } = await admin
            .from('concierge_operational_cases')
            .insert({
              patient_id: user.id,
              subject_family_member_id: subjectFamilyMember?.id || null,
              request_id: createdRequest.id,
              chat_session_id: sessionId,
              case_type: safeOperationalType,
              title: String(requestInput.title || createdRequest.title || 'Caso Concierge').slice(0, 240),
              description: String(requestInput.description || message).slice(0, 5000),
              insurer_name: requestInput.insurer_name ? String(requestInput.insurer_name).slice(0, 180) : null,
              plan_name: requestInput.plan_name ? String(requestInput.plan_name).slice(0, 180) : null,
              protocol_number: requestInput.protocol_number ? String(requestInput.protocol_number).slice(0, 180) : null,
              amount_requested: amountRequested,
              priority: highComplexity.has(safeOperationalType) || urgency === 'priority' ? 'high' : 'normal',
              status: requiresRepresentation && !representationAuth ? 'collecting_docs' : 'new',
              metadata: {
                source: 'concierge_digital_ai',
                legal_guide_code: requestInput.legal_guide_code || null,
                conversation_subject: subjectFamilyMember?.name || null,
                representation_required: requiresRepresentation,
                representation_ready: Boolean(representationAuth),
              },
            })
            .select('id,case_type,title,status,priority,insurer_name,protocol_number')
            .single()

          if (caseError) throw caseError
          createdOperationalCase = caseRow

          await admin.from('concierge_case_events').insert({
            case_id: caseRow.id,
            patient_id: user.id,
            actor_user_id: user.id,
            actor_role: 'patient',
            event_type: 'case_created_from_digital_concierge',
            visibility: 'patient',
            message: 'Criamos um acompanhamento operacional para esta demanda.',
            payload: {
              request_id: createdRequest.id,
              chat_session_id: sessionId,
              legal_guide_code: requestInput.legal_guide_code || null,
            },
          })
        } catch (caseError) {
          console.warn('Operational case engine unavailable:', caseError)
        }
      }
    }

    const needsHuman = parsed.needs_human === true || parsed.intent === 'human_handoff'
    const attentionLevel = ['watch','high'].includes(parsed.attention_level) ? parsed.attention_level : 'none'
    const attentionReason = parsed.attention_reason ? String(parsed.attention_reason).slice(0, 500) : null

    const deterministicAttention =
      /glosa|negad[oa]|autoriza[cç][aã]o|reembolso|internad[oa]|internação|cirurgia|oncolog|c[aâ]ncer|doen[cç]a rara|meu pai|minha mãe|idos[oa]/i.test(message)

    const shouldSurfaceAttention = attentionLevel !== 'none' || deterministicAttention
    const nextStatus = needsHuman ? 'human_requested' : shouldSurfaceAttention ? 'attention' : 'ai_active'

    await admin
      .from('concierge_chat_sessions')
      .update({
        status: nextStatus,
        attention_reason: attentionReason || (deterministicAttention ? 'Conversa com potencial complexidade operacional/familiar' : null),
        human_requested_at: needsHuman ? new Date().toISOString() : session.human_requested_at,
        metadata: {
          ...(session.metadata || {}),
          subject_family_member_id: subjectFamilyMember?.id || session.metadata?.subject_family_member_id || null,
          subject_name: subjectFamilyMember?.name || session.metadata?.subject_name || null,
          subject_relationship: subjectFamilyMember?.relationship || session.metadata?.subject_relationship || null,
          attention_level: attentionLevel,
          operational_type: parsed.request?.operational_type || session.metadata?.operational_type || null,
        },
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    await admin.from('concierge_chat_messages').insert({
      session_id: sessionId,
      patient_id: user.id,
      actor_role: 'ai',
      source: 'system',
      visibility: 'patient',
      content: reply,
      metadata: {
        intent: parsed.intent || 'conversation',
        needs_human: needsHuman,
        attention_level: attentionLevel,
        created_request_id: createdRequest?.id || null,
        created_operational_case_id: createdOperationalCase?.id || null,
        model: process.env.CONCIERGE_AI_MODEL || 'gpt-6-luna',
        ai_mode: aiMode,
      },
    })

    return response(200, {
      sessionId,
      status: nextStatus,
      reply,
      needsHuman,
      attentionLevel,
      createdRequest,
      createdOperationalCase,
      aiMode,
      diagnostic: process.env.CONTEXT === 'deploy-preview' ? providerDiagnostic : undefined,
    })
  } catch (error) {
    console.error('Concierge Digital AI error:', { stage: failureStage, message: error?.message || String(error) })
    return response(500, {
      error: 'concierge_ai_failed',
      diagnostic: process.env.CONTEXT === 'deploy-preview'
        ? { stage: failureStage, code: safeErrorCode(error) }
        : undefined,
    })
  }
}

function extractResponseText(payload) {
  if (payload?.output_text) return String(payload.output_text)

  const parts = []
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && content?.text) parts.push(content.text)
    }
  }
  return parts.join('\n').trim()
}

function deterministicFallback(message) {
  const text = String(message || '')
  const wantsHuman = /falar com (uma )?pessoa|atendimento humano|concierge humano|enfermeir[ao]/i.test(text)

  if (/negou|negada|negado|autoriza[cç][aã]o|glosa/i.test(text)) {
    return {
      reply: 'Entendi. Vou organizar essa negativa como um caso do Concierge para acompanharmos protocolo, documentação e próximo passo com o plano. Se for necessário falar formalmente em seu nome, pediremos a autorização específica dentro desse caso.',
      intent: 'create_request',
      needs_human: wantsHuman,
      attention_level: 'watch',
      attention_reason: 'Negativa ou autorização de plano relatada pelo paciente.',
      request: {
        category: 'navigation',
        title: 'Negativa ou autorização do plano de saúde',
        description: text.slice(0, 5000),
        urgency: 'routine',
        operational_type: 'insurance_authorization',
        insurer_name: null,
        plan_name: null,
        protocol_number: null,
        amount_requested: null,
        legal_guide_code: null,
      },
    }
  }

  if (/reembolso/i.test(text)) {
    return {
      reply: 'Entendi. Vou organizar o reembolso como um caso acompanhado pelo Concierge e identificar o que falta de documento, protocolo e prazo.',
      intent: 'create_request',
      needs_human: wantsHuman,
      attention_level: 'watch',
      attention_reason: 'Demanda de reembolso.',
      request: {
        category: 'navigation',
        title: 'Reembolso do plano de saúde',
        description: text.slice(0, 5000),
        urgency: 'routine',
        operational_type: 'reimbursement',
        insurer_name: null,
        plan_name: null,
        protocol_number: null,
        amount_requested: null,
        legal_guide_code: null,
      },
    }
  }

  return {
    reply: wantsHuman
      ? 'Certo. Vou avisar a equipe Concierge para entrar na conversa.'
      : 'Recebi sua mensagem. Posso organizar os próximos passos e, quando necessário, envolver a equipe humana.',
    intent: wantsHuman ? 'human_handoff' : 'conversation',
    needs_human: wantsHuman,
    attention_level: 'none',
    attention_reason: null,
    request: null,
  }
}

function safeErrorCode(error) {
  const raw = String(error?.code || error?.name || 'runtime_error')
  return raw.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80)
}

function parseAI(raw) {
  const text = String(raw || '').trim()
  const cleaned = text.replace(/^\`\`\`json\s*/i, '').replace(/\`\`\`$/i, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    return {
      reply: text || 'Entendi. Vou acompanhar isso com você.',
      intent: 'conversation',
      needs_human: false,
      attention_reason: null,
      request: null,
    }
  }
}

function safeEqual(a, b) {
  if (!a || !b) return false
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

function bearer(value) {
  const match = String(value || '').match(/^Bearer\s+(.+)$/i)
  return match?.[1] || null
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
