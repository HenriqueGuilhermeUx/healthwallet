const PROMPT_VERSION = 'concierge-case-assist-v1'
const DEFAULT_MODEL = 'gpt-4.1-mini'

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    documented_facts: { type: 'array', items: { type: 'string' } },
    missing_information: { type: 'array', items: { type: 'string' } },
    suggested_questions: { type: 'array', items: { type: 'string' } },
    workflow_next_steps: { type: 'array', items: { type: 'string' } },
    attention_level: { type: 'string', enum: ['routine', 'priority', 'human_review_now'] },
    attention_reason: { type: 'string' },
    physician_review_recommended: { type: 'boolean' },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'summary',
    'documented_facts',
    'missing_information',
    'suggested_questions',
    'workflow_next_steps',
    'attention_level',
    'attention_reason',
    'physician_review_recommended',
    'limitations',
  ],
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' })

  const authHeader = event.headers?.authorization || event.headers?.Authorization || ''
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'Sessão profissional obrigatória.' })

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return json(400, { error: 'Corpo inválido.' })
  }

  const requestId = String(body.requestId || '').trim()
  if (!requestId) return json(400, { error: 'Caso não informado.' })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_CONCIERGE_MODEL || DEFAULT_MODEL

  if (!supabaseUrl || !supabaseAnonKey) return json(503, { error: 'Supabase não configurado para a função.' })
  if (!openaiKey) return json(503, { error: 'Apoio de IA ainda não foi ativado no ambiente de validação.' })

  const supabaseHeaders = {
    apikey: supabaseAnonKey,
    Authorization: authHeader,
    'Content-Type': 'application/json',
  }

  try {
    const [user, requestRows] = await Promise.all([
      supabaseGet(`${supabaseUrl}/auth/v1/user`, supabaseHeaders),
      supabaseGet(
        `${supabaseUrl}/rest/v1/concierge_requests?id=eq.${encodeURIComponent(requestId)}&select=id,patient_id,category,title,description,subject_relationship,symptom_payload,urgency,status,created_at`,
        supabaseHeaders,
      ),
    ])

    const request = Array.isArray(requestRows) ? requestRows[0] : null
    if (!user?.id || !request) return json(403, { error: 'Caso indisponível para esta conta.' })

    const membershipRows = await supabaseGet(
      `${supabaseUrl}/rest/v1/concierge_memberships?patient_id=eq.${encodeURIComponent(request.patient_id)}&select=consent_status,consent_scope,status`,
      supabaseHeaders,
    )
    const membership = Array.isArray(membershipRows) ? membershipRows[0] : null
    const aiAllowed = membership?.consent_status === 'accepted'
      && ['pilot', 'active'].includes(membership?.status)
      && membership?.consent_scope?.ai_assist === true

    if (!aiAllowed) {
      return json(403, {
        error: 'O paciente não autorizou o uso de IA para apoio interno da equipe neste Concierge.',
        code: 'AI_ASSIST_CONSENT_REQUIRED',
      })
    }

    const [context, events, actions, staffRows] = await Promise.all([
      supabasePost(
        `${supabaseUrl}/rest/v1/rpc/concierge_get_request_context`,
        supabaseHeaders,
        { target_request: requestId },
      ),
      supabaseGet(
        `${supabaseUrl}/rest/v1/concierge_request_events?request_id=eq.${encodeURIComponent(requestId)}&select=actor_role,event_type,visibility,message,created_at&order=created_at.desc&limit=30`,
        supabaseHeaders,
      ),
      supabaseGet(
        `${supabaseUrl}/rest/v1/concierge_actions?request_id=eq.${encodeURIComponent(requestId)}&status=not.in.(completed,cancelled)&select=title,description,category,due_date,priority,status,created_at&order=created_at.desc&limit=20`,
        supabaseHeaders,
      ),
      supabaseGet(
        `${supabaseUrl}/rest/v1/concierge_staff?user_id=eq.${encodeURIComponent(user.id)}&select=role,display_name,active`,
        supabaseHeaders,
      ),
    ])

    const staff = Array.isArray(staffRows) ? staffRows[0] : null
    if (!staff?.active) return json(403, { error: 'Equipe Concierge não autorizada.' })

    const safeContext = sanitize({
      request: {
        category: request.category,
        title: request.title,
        description: request.description,
        subject_relationship: request.subject_relationship,
        symptom_payload: request.symptom_payload,
        urgency: request.urgency,
        status: request.status,
        created_at: request.created_at,
      },
      authorized_health_context: context || {},
      recent_case_events: Array.isArray(events) ? events.reverse() : [],
      open_actions: Array.isArray(actions) ? actions : [],
    })

    const openaiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        store: false,
        instructions: [
          'Você é um assistente interno de coordenação do HealthWallet Concierge.',
          'Seu trabalho é organizar o caso para um profissional humano, não atender o paciente.',
          'Use somente os dados fornecidos. Não invente fatos, doenças, diagnósticos ou resultados.',
          'Não prescreva, não recomende alteração de medicamento e não conclua tratamento.',
          'Não publique mensagem ao paciente e não proponha ação automática no prontuário.',
          'Prioridade operacional deve refletir somente sinais explicitamente documentados, urgência já marcada ou necessidade clara de revisão humana.',
          'Quando houver incerteza, registre-a. Quando o caso exigir decisão clínica, indique revisão médica humana.',
          'Diferencie dados originais de análises anteriores geradas por software.',
        ].join(' '),
        input: `Organize este caso para a equipe. Contexto autorizado:\n${JSON.stringify(safeContext).slice(0, 60000)}`,
        text: {
          format: {
            type: 'json_schema',
            name: 'concierge_case_assist',
            strict: true,
            schema,
          },
        },
      }),
    })

    const openaiJson = await openaiRes.json()
    if (!openaiRes.ok) {
      console.error('Concierge AI provider failed:', openaiJson?.error?.message || openaiRes.status)
      return json(502, { error: 'O apoio de IA não respondeu. O caso continua disponível normalmente.' })
    }

    let assist
    try {
      assist = JSON.parse(openaiJson.output_text || '')
    } catch {
      return json(502, { error: 'A IA respondeu em formato inesperado. Nenhuma ação foi executada.' })
    }

    await logUsage({
      supabaseUrl,
      headers: supabaseHeaders,
      request,
      user,
      staff,
      model,
      assist,
    })

    return json(200, {
      assist,
      metadata: {
        provider: 'openai',
        model,
        promptVersion: PROMPT_VERSION,
        patientFacing: false,
        autonomousAction: false,
      },
    })
  } catch (error) {
    console.error('Concierge AI assist failed:', error)
    return json(500, { error: 'Não foi possível gerar o apoio interno agora. Nenhuma ação foi executada.' })
  }
}

async function logUsage({ supabaseUrl, headers, request, user, staff, model, assist }) {
  try {
    await supabasePost(`${supabaseUrl}/rest/v1/concierge_request_events`, headers, {
      request_id: request.id,
      patient_id: request.patient_id,
      actor_user_id: user.id,
      actor_role: staff.role,
      event_type: 'ai_assist_generated',
      visibility: 'staff_only',
      message: 'Apoio de IA interno gerado para organização do caso.',
      payload: {
        provider: 'openai',
        model,
        prompt_version: PROMPT_VERSION,
        attention_level: assist?.attention_level || null,
        patient_facing: false,
        autonomous_action: false,
      },
    })
  } catch (error) {
    console.warn('Concierge AI audit event failed:', error)
  }
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize)
  if (!value || typeof value !== 'object') return value

  const blocked = new Set([
    'id',
    'patient_id',
    'request_id',
    'user_id',
    'actor_user_id',
    'professional_id',
    'assigned_nurse_id',
    'assigned_doctor_id',
    'subject_name',
    'file_name',
    'file_url',
    'metadata',
    'ai_analysis',
  ])

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !blocked.has(key))
      .map(([key, item]) => [key, sanitize(item)]),
  )
}

async function supabaseGet(url, headers) {
  const res = await fetch(url, { headers })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.message || data?.error_description || `Supabase ${res.status}`)
  return data
}

async function supabasePost(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.message || data?.error_description || `Supabase ${res.status}`)
  return data
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
