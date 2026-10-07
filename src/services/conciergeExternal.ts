import { supabase } from '@/lib/supabase'

export type ExternalCoordinationStatus =
  | 'new'
  | 'researching'
  | 'options_ready'
  | 'awaiting_patient_choice'
  | 'selected'
  | 'scheduling'
  | 'booked'
  | 'instructions_sent'
  | 'completed'
  | 'result_expected'
  | 'result_received'
  | 'closed'
  | 'cancelled'

export async function listMyExternalCoordinations(patientId: string) {
  const { data, error } = await supabase
    .from('concierge_external_tasks')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getMyExternalCoordination(taskId: string, patientId: string) {
  const { data, error } = await supabase
    .from('concierge_external_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('patient_id', patientId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function listMyExternalCoordinationOptions(taskId: string) {
  const { data, error } = await supabase
    .from('concierge_external_options')
    .select('id,task_id,provider_name,provider_type,address,city,state,phone,website,price_amount,currency,accepts_insurance,insurance_notes,earliest_slot,distance_text,status,created_at,updated_at')
    .eq('task_id', taskId)
    .in('status', ['offered', 'selected'])
    .order('earliest_slot', { ascending: true, nullsFirst: false })

  if (error) throw error
  return data || []
}

export async function listMyExternalCoordinationEvents(taskId: string) {
  const { data, error } = await supabase
    .from('concierge_external_events')
    .select('*')
    .eq('task_id', taskId)
    .eq('visibility', 'patient')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function selectExternalCoordinationOption(taskId: string, optionId: string) {
  const { data, error } = await supabase.rpc('concierge_patient_select_external_option', {
    p_task_id: taskId,
    p_option_id: optionId,
  })

  if (error) throw error
  return data
}
