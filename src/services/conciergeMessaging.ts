import { supabase } from '@/lib/supabase'

export async function sendConciergePatientReply(requestId: string, message: string) {
  const body = message.trim()
  if (!body) throw new Error('Mensagem vazia')

  const { data, error } = await supabase.rpc('concierge_patient_reply', {
    target_request: requestId,
    body,
  })

  if (error) throw error
  return data
}
