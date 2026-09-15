import { supabase } from '@/lib/supabase'

export type ConciergeAIAssist = {
  summary: string
  documented_facts: string[]
  missing_information: string[]
  suggested_questions: string[]
  workflow_next_steps: string[]
  attention_level: 'routine' | 'priority' | 'human_review_now'
  attention_reason: string
  physician_review_recommended: boolean
  limitations: string[]
}

export type ConciergeAIAssistResponse = {
  assist: ConciergeAIAssist
  metadata: {
    provider: string
    model: string
    promptVersion: string
    patientFacing: boolean
    autonomousAction: boolean
  }
}

export async function generateConciergeAIAssist(requestId: string): Promise<ConciergeAIAssistResponse> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token

  if (!token) throw new Error('Sessão profissional expirada.')

  const response = await fetch('/.netlify/functions/concierge-ai-assist', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requestId, taskType: 'case_brief' }),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error || 'Não foi possível gerar o apoio de IA.') as Error & { code?: string }
    error.code = body.code
    throw error
  }

  if (!body?.assist?.summary || !Array.isArray(body?.assist?.workflow_next_steps)) {
    throw new Error('Resposta inválida do apoio de IA.')
  }

  return body as ConciergeAIAssistResponse
}
