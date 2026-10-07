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

export async function listMyExternalCoordinations(_patientId?: string) {
  const { data, error } = await supabase.rpc('concierge_patient_list_external_tasks')

  if (error) throw error
  return data || []
}

export async function getMyExternalCoordination(taskId: string, _patientId?: string) {
  const rows = await listMyExternalCoordinations()
  return rows.find((item: any) => item.id === taskId) || null
}

export async function listMyExternalCoordinationOptions(taskId: string) {
  const { data, error } = await supabase.rpc('concierge_patient_list_external_options', {
    p_task_id: taskId,
  })

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
