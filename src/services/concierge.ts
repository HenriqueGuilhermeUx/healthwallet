import { supabase } from '@/lib/supabase'

export type ConciergeRequestCategory =
  | 'symptom'
  | 'guidance'
  | 'exam_review'
  | 'second_analysis'
  | 'medication_review'
  | 'navigation'
  | 'other'

export type ConciergeRequestStatus =
  | 'new'
  | 'in_triage'
  | 'waiting_patient'
  | 'waiting_nurse'
  | 'escalated_medical'
  | 'medical_review'
  | 'action_plan'
  | 'resolved'
  | 'closed'

export type ConciergeRequestInput = {
  patientId: string
  category: ConciergeRequestCategory
  title: string
  description: string
  subjectName?: string
  subjectRelationship?: string
  symptomPayload?: Record<string, unknown>
  contextSnapshot?: Record<string, unknown>
  urgency?: 'routine' | 'priority' | 'urgent_redirect'
}

export async function createConciergeRequest(input: ConciergeRequestInput) {
  const { data, error } = await supabase
    .from('concierge_requests')
    .insert({
      patient_id: input.patientId,
      category: input.category,
      title: input.title,
      description: input.description,
      subject_name: input.subjectName || null,
      subject_relationship: input.subjectRelationship || null,
      symptom_payload: input.symptomPayload || {},
      context_snapshot: input.contextSnapshot || {},
      urgency: input.urgency || 'routine',
      status: 'new',
      metadata: { source_app: 'healthwallet', product: 'health_concierge' },
    })
    .select('*')
    .single()

  if (error) throw error

  await supabase.from('concierge_request_events').insert({
    request_id: data.id,
    patient_id: input.patientId,
    actor_user_id: input.patientId,
    actor_role: 'patient',
    event_type: 'request_created',
    visibility: 'patient',
    message: 'Solicitação enviada ao HealthWallet Concierge.',
    payload: { category: input.category },
  })

  return data
}

export async function listMyConciergeRequests(patientId: string) {
  const { data, error } = await supabase
    .from('concierge_requests')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getConciergeRequest(requestId: string) {
  const { data, error } = await supabase
    .from('concierge_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (error) throw error
  return data
}

export async function listConciergeRequestEvents(requestId: string) {
  const { data, error } = await supabase
    .from('concierge_request_events')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function addPatientRequestMessage(requestId: string, patientId: string, message: string) {
  const { error } = await supabase.from('concierge_request_events').insert({
    request_id: requestId,
    patient_id: patientId,
    actor_user_id: patientId,
    actor_role: 'patient',
    event_type: 'patient_message',
    visibility: 'patient',
    message,
  })

  if (error) throw error
}

export async function listMyConciergeActions(patientId: string) {
  const { data, error } = await supabase
    .from('concierge_actions')
    .select('*')
    .eq('patient_id', patientId)
    .order('status', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function completeConciergeAction(actionId: string, patientId: string, completionNote?: string) {
  const { data, error } = await supabase
    .from('concierge_actions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completion_note: completionNote || null,
    })
    .eq('id', actionId)
    .eq('patient_id', patientId)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function reopenConciergeAction(actionId: string, patientId: string) {
  const { data, error } = await supabase
    .from('concierge_actions')
    .update({ status: 'pending', completed_at: null, completion_note: null })
    .eq('id', actionId)
    .eq('patient_id', patientId)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function listConciergePrograms() {
  const { data, error } = await supabase
    .from('concierge_programs')
    .select('*')
    .eq('active', true)
    .order('name', { ascending: true })

  if (error) throw error
  return data || []
}

export async function listMyProgramEnrollments(patientId: string) {
  const { data, error } = await supabase
    .from('concierge_program_enrollments')
    .select('*, concierge_programs(*)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function enrollInConciergeProgram(patientId: string, program: any) {
  const { data, error } = await supabase
    .from('concierge_program_enrollments')
    .upsert({
      patient_id: patientId,
      program_id: program.id,
      status: 'active',
      goals: program.default_goals || [],
      metadata: { enrolled_from: 'healthwallet' },
    }, { onConflict: 'patient_id,program_id' })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function listMyConciergeTeam(patientId: string) {
  const { data, error } = await supabase
    .from('concierge_assignments')
    .select('*')
    .eq('patient_id', patientId)
    .eq('status', 'active')
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function getMyConciergeMembership(patientId: string) {
  const { data, error } = await supabase
    .from('concierge_memberships')
    .select('*')
    .eq('patient_id', patientId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getConciergeStaffSelf(userId: string) {
  const { data, error } = await supabase
    .from('concierge_staff')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function listOperationsRequests() {
  const { data, error } = await supabase
    .from('concierge_requests')
    .select('*')
    .not('status', 'in', '(closed,resolved)')
    .order('urgency', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function listOperationsAlerts() {
  const { data, error } = await supabase
    .from('concierge_alerts')
    .select('*')
    .eq('status', 'open')
    .order('severity', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return data || []
}

export async function assignRequestToSelf(request: any, staff: any) {
  const patch: Record<string, unknown> = { status: 'in_triage' }
  if (staff.role === 'doctor') patch.assigned_doctor_id = staff.user_id
  else patch.assigned_nurse_id = staff.user_id

  const { data, error } = await supabase
    .from('concierge_requests')
    .update(patch)
    .eq('id', request.id)
    .select('*')
    .single()

  if (error) throw error

  await addStaffEvent(request.id, request.patient_id, staff, 'assigned', `Caso assumido por ${staff.display_name || 'profissional da equipe'}.`)
  return data
}

export async function updateConciergeRequestStatus(request: any, staff: any, status: ConciergeRequestStatus, note?: string) {
  const patch: Record<string, unknown> = { status }
  const now = new Date().toISOString()

  if (status === 'in_triage') patch.triaged_at = now
  if (status === 'escalated_medical') patch.escalated_at = now
  if (status === 'resolved') patch.resolved_at = now
  if (status === 'closed') patch.closed_at = now
  if (note && status === 'resolved') patch.resolution_summary = note

  const { data, error } = await supabase
    .from('concierge_requests')
    .update(patch)
    .eq('id', request.id)
    .select('*')
    .single()

  if (error) throw error

  await addStaffEvent(
    request.id,
    request.patient_id,
    staff,
    `status_${status}`,
    note || `Status atualizado para ${status}.`,
  )

  return data
}

export async function addStaffEvent(
  requestId: string,
  patientId: string,
  staff: any,
  eventType: string,
  message: string,
  visibility: 'patient' | 'staff_only' = 'patient',
  payload: Record<string, unknown> = {},
) {
  const { error } = await supabase.from('concierge_request_events').insert({
    request_id: requestId,
    patient_id: patientId,
    actor_user_id: staff.user_id,
    actor_role: staff.role,
    event_type: eventType,
    visibility,
    message,
    payload,
  })

  if (error) throw error
}

export async function createConciergeAction(input: {
  patientId: string
  requestId?: string
  createdBy: string
  title: string
  description?: string
  category?: string
  dueDate?: string
  priority?: string
}) {
  const { data, error } = await supabase
    .from('concierge_actions')
    .insert({
      patient_id: input.patientId,
      request_id: input.requestId || null,
      created_by: input.createdBy,
      title: input.title,
      description: input.description || null,
      category: input.category || 'general',
      due_date: input.dueDate || null,
      priority: input.priority || 'normal',
      status: 'pending',
      metadata: { created_from: 'concierge_operations' },
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}
