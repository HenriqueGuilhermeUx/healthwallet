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

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function calculateSegment(
  key: 'with_plan' | 'without_plan' | 'unknown_plan',
  label: string,
  memberships: any[],
  requests: any[],
  workLogs: any[],
) {
  const patientIds = new Set(memberships.map((item) => item.patient_id))
  const segmentRequests = requests.filter((item) => patientIds.has(item.patient_id))
  const segmentWorkLogs = workLogs.filter((item) => patientIds.has(item.patient_id))
  const patientCount = patientIds.size

  const escalated = segmentRequests.filter(
    (item) => item.escalated_at || ['escalated_medical', 'medical_review'].includes(item.status),
  ).length
  const resolved = segmentRequests.filter(
    (item) => item.resolved_at || ['resolved', 'closed'].includes(item.status),
  ).length

  const responseMinutes = segmentRequests
    .filter((item) => item.first_response_at)
    .map((item) => (new Date(item.first_response_at).getTime() - new Date(item.created_at).getTime()) / 60000)
    .filter((value) => Number.isFinite(value) && value >= 0)

  const resolutionHours = segmentRequests
    .filter((item) => item.resolved_at)
    .map((item) => (new Date(item.resolved_at).getTime() - new Date(item.created_at).getTime()) / 3600000)
    .filter((value) => Number.isFinite(value) && value >= 0)

  const requestCounts = new Map<string, number>()
  segmentRequests.forEach((item) => requestCounts.set(item.patient_id, (requestCounts.get(item.patient_id) || 0) + 1))
  const engagedPatients = requestCounts.size
  const repeatPatients = Array.from(requestCounts.values()).filter((count) => count >= 2).length

  const totalHumanMinutes = segmentWorkLogs.reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0)
  const nurseMinutes = segmentWorkLogs
    .filter((item) => ['nurse', 'care_coordinator'].includes(item.staff_role))
    .reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0)
  const doctorMinutes = segmentWorkLogs
    .filter((item) => item.staff_role === 'doctor')
    .reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0)

  return {
    key,
    label,
    patients: patientCount,
    requests: segmentRequests.length,
    requestsPerPatient: patientCount ? segmentRequests.length / patientCount : 0,
    engagedPatients,
    engagementRate: patientCount ? (engagedPatients / patientCount) * 100 : 0,
    repeatPatients,
    repeatRate: engagedPatients ? (repeatPatients / engagedPatients) * 100 : 0,
    escalated,
    escalationRate: segmentRequests.length ? (escalated / segmentRequests.length) * 100 : 0,
    resolved,
    resolutionRate: segmentRequests.length ? (resolved / segmentRequests.length) * 100 : 0,
    avgFirstResponseMinutes: average(responseMinutes),
    avgResolutionHours: average(resolutionHours),
    totalHumanMinutes,
    humanMinutesPerPatient: patientCount ? totalHumanMinutes / patientCount : 0,
    nurseMinutes,
    nurseMinutesPerPatient: patientCount ? nurseMinutes / patientCount : 0,
    doctorMinutes,
    doctorMinutesPerPatient: patientCount ? doctorMinutes / patientCount : 0,
    doctorShareOfHumanTime: totalHumanMinutes ? (doctorMinutes / totalHumanMinutes) * 100 : 0,
  }
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
  const activePatientIds = new Set(memberships.map((item) => item.patient_id))

  // Pilot economics must describe the current pilot cohort, not historical/non-active patients.
  const requests = (requestRes.data || []).filter((item) => activePatientIds.has(item.patient_id))
  const workLogs = (workRes.data || []).filter((item) => activePatientIds.has(item.patient_id))
  const staff = staffRes.data || []

  const escalated = requests.filter(
    (item) => item.escalated_at || ['escalated_medical', 'medical_review'].includes(item.status),
  ).length
  const resolved = requests.filter(
    (item) => item.resolved_at || ['resolved', 'closed'].includes(item.status),
  ).length

  const responseMinutes = requests
    .filter((item) => item.first_response_at)
    .map((item) => (new Date(item.first_response_at).getTime() - new Date(item.created_at).getTime()) / 60000)
    .filter((value) => Number.isFinite(value) && value >= 0)

  const resolutionHours = requests
    .filter((item) => item.resolved_at)
    .map((item) => (new Date(item.resolved_at).getTime() - new Date(item.created_at).getTime()) / 3600000)
    .filter((value) => Number.isFinite(value) && value >= 0)

  const totalHumanMinutes = workLogs.reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0)
  const nurseMinutes = workLogs
    .filter((item) => ['nurse', 'care_coordinator'].includes(item.staff_role))
    .reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0)
  const doctorMinutes = workLogs
    .filter((item) => item.staff_role === 'doctor')
    .reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0)

  const withPlanMemberships = memberships.filter((item) => item.has_health_plan === true)
  const withoutPlanMemberships = memberships.filter((item) => item.has_health_plan === false)
  const unknownPlanMemberships = memberships.filter((item) => item.has_health_plan == null)

  const planSegments = [
    calculateSegment('with_plan', 'Com plano', withPlanMemberships, requests, workLogs),
    calculateSegment('without_plan', 'Sem plano', withoutPlanMemberships, requests, workLogs),
    calculateSegment('unknown_plan', 'Não informado', unknownPlanMemberships, requests, workLogs),
  ]

  return {
    memberships,
    requests,
    workLogs,
    staff,
    activePatients: activePatientIds.size,
    withPlan: withPlanMemberships.length,
    withoutPlan: withoutPlanMemberships.length,
    unknownPlan: unknownPlanMemberships.length,
    requests30d: requests.length,
    escalated,
    escalationRate: requests.length ? (escalated / requests.length) * 100 : 0,
    resolved,
    resolutionRate: requests.length ? (resolved / requests.length) * 100 : 0,
    avgFirstResponseMinutes: average(responseMinutes),
    avgResolutionHours: average(resolutionHours),
    totalHumanMinutes,
    humanMinutesPerPatient: activePatientIds.size ? totalHumanMinutes / activePatientIds.size : 0,
    nurseMinutes,
    doctorMinutes,
    requestsPerPatient: activePatientIds.size ? requests.length / activePatientIds.size : 0,
    planSegments,
  }
}
