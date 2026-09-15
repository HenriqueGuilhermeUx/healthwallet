import { supabase } from '@/lib/supabase'

export const CONCIERGE_CONSENT_VERSION = 'concierge-consent-v1'

export const DEFAULT_CONCIERGE_SCOPE = {
  summary: true,
  exams: true,
  medications: true,
  timeline: true,
  passport: true,
  medscore: true,
  device_data: true,
  daily_summaries: true,
  documents: true,
  family: false,
} as const

export type ConciergeConsentScope = Record<keyof typeof DEFAULT_CONCIERGE_SCOPE, boolean>

export async function getConciergeMembershipForPatient(patientId: string) {
  const { data, error } = await supabase
    .from('concierge_memberships')
    .select('*')
    .eq('patient_id', patientId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function acceptConciergeConsent(scope: ConciergeConsentScope) {
  const { data, error } = await supabase.rpc('concierge_accept_consent', {
    requested_scope: scope,
    requested_version: CONCIERGE_CONSENT_VERSION,
  })

  if (error) throw error
  return data
}

export async function revokeConciergeConsent() {
  const { data, error } = await supabase.rpc('concierge_revoke_consent')
  if (error) throw error
  return data
}

export async function listConciergeConsentEvents(patientId: string) {
  const { data, error } = await supabase
    .from('concierge_consent_events')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) throw error
  return data || []
}

export async function listConciergeContextAccessLogs(patientId: string) {
  const { data, error } = await supabase
    .from('concierge_context_access_logs')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) throw error
  return data || []
}
