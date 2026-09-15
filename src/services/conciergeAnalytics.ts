import { supabase } from '@/lib/supabase'

export async function logConciergeWork(input: {
  staffUserId: string
  patientId: string
  requestId?: string
  staffRole: string
  workType: 'triage' | 'message' | 'clinical_review' | 'care_coordination' | 'action_plan' | 'follow_up' | 'teleconsult' | 'other'
  durationMinutes: number
  outcome?: string
}) {
  const { data, error } = await supabase
    .from('concierge_work_logs')
    .insert({
      staff_user_id: input.staffUserId,
      patient_id: input.patientId,
      request_id: input.requestId || null,
      staff_role: input.staffRole,
      work_type: input.workType,
      duration_minutes: Math.max(1, Math.min(480, Math.round(input.durationMinutes))),
      outcome: input.outcome || null,
      metadata: { source: 'concierge_case_workspace' },
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function loadConciergePilotMetrics() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [membershipRes, requestRes, workRes, staffRes] = await Promise.all([
    supabase.from('concierge_memberships').select('*').in('status', ['pilot', 'active']),
    supabase.from('concierge_requests').select('*').gte('created_at', since),
    supabase.from('concierge_work_logs').select('*').gte('created_at', since),
    supabase.from('concierge_staff').select('*').eq('active', true),
  ])

  if (membershipRes.error) throw membershipRes.error
  if (requestRes.error) throw requestRes.error
  if (workRes.error) throw workRes.error
  if (staffRes.error) throw staffRes.error

  const memberships = membershipRes.data || []
  const requests = requestRes.data || []
  const workLogs = workRes.data || []
  const staff = staffRes.data || []

  const activePatientIds = new Set(memberships.map((item) => item.patient_id))
  const escalated = requests.filter((item) => item.escalated_at || ['escalated_medical', 'medical_review'].includes(item.status)).length
  const resolved = requests.filter((item) => item.resolved_at || ['resolved', 'closed'].includes(item.status)).length
  const responseMinutes = requests
    .filter((item) => item.first_response_at)
    .map((item) => (new Date(item.first_response_at).getTime() - new Date(item.created_at).getTime()) / 60000)
    .filter((value) => Number.isFinite(value) && value >= 0)
  const resolutionHours = requests
    .filter((item) => item.resolved_at)
    .map((item) => (new Date(item.resolved_at).getTime() - new Date(item.created_at).getTime()) / 3600000)
    .filter((value) => Number.isFinite(value) && value >= 0)

  const totalHumanMinutes = workLogs.reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0)
  const nurseMinutes = workLogs.filter((item) => ['nurse', 'care_coordinator'].includes(item.staff_role)).reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0)
  const doctorMinutes = workLogs.filter((item) => item.staff_role === 'doctor').reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0)

  return {
    memberships,
    requests,
    workLogs,
    staff,
    activePatients: activePatientIds.size,
    withPlan: memberships.filter((item) => item.has_health_plan === true).length,
    withoutPlan: memberships.filter((item) => item.has_health_plan === false).length,
    unknownPlan: memberships.filter((item) => item.has_health_plan == null).length,
    requests30d: requests.length,
    escalated,
    escalationRate: requests.length ? (escalated / requests.length) * 100 : 0,
    resolved,
    resolutionRate: requests.length ? (resolved / requests.length) * 100 : 0,
    avgFirstResponseMinutes: responseMinutes.length ? responseMinutes.reduce((a, b) => a + b, 0) / responseMinutes.length : 0,
    avgResolutionHours: resolutionHours.length ? resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length : 0,
    totalHumanMinutes,
    humanMinutesPerPatient: activePatientIds.size ? totalHumanMinutes / activePatientIds.size : 0,
    nurseMinutes,
    doctorMinutes,
    requestsPerPatient: activePatientIds.size ? requests.length / activePatientIds.size : 0,
  }
}
