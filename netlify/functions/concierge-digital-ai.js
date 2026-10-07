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
  "operational_type": "provider_search|scheduling|insurance_authorization|reimbursement|claim_denial|hospitalization|surgery|complex_case|caregiver_coordination|general_navigation"
}

Use create_request somente quando o paciente estiver efetivamente pedindo uma ação/coordenação concreta.

Sinais para attention_level:
- "watch": conversa repetitiva, frustração, bloqueio operacional, idoso/familiar dependente, dificuldade com plano, autorização, reembolso ou acesso;
- "high": internação, cirurgia próxima, caso oncológico/complexo, glosa que ameaça continuidade, sofrimento emocional importante, ou situação em que a equipe humana deveria enxergar logo mesmo sem pedido explícito.
Não transforme attention em decisão clínica. É um sinal operacional para a equipe Concierge.
`

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return response(204, null)
  }

  if (event.httpMethod !== 'POST') {
    return response(405, { error: 'method_not_allowed' })
  }

  try {
    const token = bearer(event.headers?.authorization || event.headers?.Authorization)
    if (!token) return response(401, { error: 'authentication_required' })

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
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

    const { data: authData, error: authError } = await userClient.auth.getUser(token)
    const user = authData?.user
    if (authError || !user) return response(401, { error: 'invalid_session' })

    const body = JSON.parse(event.body || '{}')
    const message = String(body.message || '').trim().slice(0, 5000)
    const source = body.source === 'voice' ? 'voice' : 'text'
    const requestedSubjectFamilyMemberId = body.subjectFamilyMemberId ? String(body.subjectFamilyMemberId) : null
    let sessionId = body.sessionId ? String(body.sessionId) : null

    if (!message) return response(400, { error: 'message_required' })

    const { data: membership } = await admin
      .from('concierge_memberships')
      .select('patient_id,status,plan_code,consent_status,metadata')
      .eq('patient_id', user.id)
      .maybeSingle()

    const allowed =
      membership
      && ['pilot', 'active'].includes(membership.status)
      && membership.consent_status === 'accepted'
      && String(membership.plan_code || '').startsWith('concierge')

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
      const { data, error } = await admin
        .from('concierge_chat_sessions')
        .insert({
          patient_id: user.id,
          status: 'ai_active',
          channel: source === 'voice' ? 'voice' : 'text',
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
        channel: session.channel === source ? session.channel : 'mixed',
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

    const [profileRes, scoreRes, actionsRes, requestsRes, coordinationRes, historyRes] = await Promise.all([
      admin.from('profiles').select('id,full_name,name').eq('id', user.id).maybeSingle(),
      admin.from('health_scores').select('score,status,calculated_at').eq('user_id', user.id).order('calculated_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('concierge_actions').select('id,title,status,due_date').eq('patient_id', user.id).in('status', ['pending','in_progress']).order('due_date', { ascending: true, nullsFirst: false }).limit(8),
      admin.from('concierge_requests').select('id,title,status,urgency,category,created_at').eq('patient_id', user.id).not('status', 'in', '(closed,resolved)').order('created_at', { ascending: false }).limit(8),
      admin.from('concierge_external_tasks').select('id,title,status,provider_name,scheduled_at,preparation_instructions').eq('patient_id', user.id).not('status', 'in', '(closed,cancelled)').order('created_at', { ascending: false }).limit(8),
      admin.from('concierge_chat_messages').select('actor_role,content,created_at,visibility').eq('session_id', sessionId).eq('visibility', 'patient').order('created_at', { ascending: false }).limit(16),
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

    const aiJson = await aiRes.json()
    if (!aiRes.ok) {
      throw new Error(aiJson?.error?.message || 'AI request failed')
    }

    const parsed = parseAI(aiJson.output_text)
    const reply = String(parsed.reply || 'Entendi. Vou acompanhar isso com você.').slice(0, 6000)

    let createdRequest = null
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
        model: process.env.CONCIERGE_AI_MODEL || 'gpt-6-luna',
      },
    })

    return response(200, {
      sessionId,
      status: nextStatus,
      reply,
      needsHuman,
      attentionLevel,
      createdRequest,
    })
  } catch (error) {
    console.error('Concierge Digital AI error:', error)
    return response(500, { error: 'concierge_ai_failed' })
  }
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
