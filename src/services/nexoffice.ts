import { supabase } from '@/lib/supabase'

export type NexOfficeHealthWindow = 'hour' | 'day' | 'week' | 'month'
export type NexOfficeHealthScope = 'workspace' | 'team'

export type NexOfficeHealthSignal =
  | {
      signalType: 'appointments.summary'
      periodStart: string
      periodEnd: string
      dimensions: { window: NexOfficeHealthWindow; scope: NexOfficeHealthScope }
      metrics: { scheduled: number; completed: number; cancelled: number; noShow: number; pending: number }
      correlationId?: string
    }
  | {
      signalType: 'requests.summary'
      periodStart: string
      periodEnd: string
      dimensions: { window: NexOfficeHealthWindow; scope: NexOfficeHealthScope }
      metrics: { open: number; overdue: number; escalated: number; resolved: number }
      correlationId?: string
    }
  | {
      signalType: 'sla.summary'
      periodStart: string
      periodEnd: string
      dimensions: { window: NexOfficeHealthWindow; scope: NexOfficeHealthScope }
      metrics: { total: number; withinSla: number; breached: number; avgFirstResponseMinutes: number; complianceRatio: number }
      correlationId?: string
    }
  | {
      signalType: 'workload.summary'
      periodStart: string
      periodEnd: string
      dimensions: { window: NexOfficeHealthWindow; scope: NexOfficeHealthScope }
      metrics: { activeCases: number; waitingReview: number; waitingPatientReply: number; dueToday: number }
      correlationId?: string
    }
  | {
      signalType: 'programs.summary'
      periodStart: string
      periodEnd: string
      dimensions: { window: NexOfficeHealthWindow; scope: NexOfficeHealthScope }
      metrics: { enrolled: number; active: number; completed: number; paused: number }
      correlationId?: string
    }

async function bridge<T>(body: Record<string, unknown>): Promise<T> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sessão autenticada necessária para acessar o NexOffice.')

  const response = await fetch('/api/nexoffice', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(String(payload?.message || payload?.error || `NexOffice bridge HTTP ${response.status}`))
  }
  return payload as T
}

export function getNexOfficeBridgeHealth() {
  return bridge<{ ok: true; service: string; capabilities: string[]; externalEffects: boolean }>({ action: 'health' })
}

export function provisionMyDataMed() {
  return bridge<{
    ok: true
    created: boolean
    userExists: boolean
    memberRole: 'owner' | 'admin' | 'member' | 'viewer'
    workspace: { id: string; name: string; slug: string; vertical: 'health'; status: string; modules: string[] }
    origin: { workspace_id: string; source_product: 'mydatamed'; external_workspace_ref: string; mode: string }
  }>({ action: 'provision' })
}

export function createMyDataMedHandoff() {
  return bridge<{ ok: true; handoffCode: string; expiresAt: string; url: string | null }>({ action: 'handoff' })
}

export function exchangeMyDataMedSession() {
  return bridge<{
    ok: true
    token: string
    expiresAt: string
    workspace: {
      id: string
      name: string
      slug: string
      vertical: 'health'
      status: string
      role: 'owner' | 'admin' | 'member' | 'viewer'
      permissions: string[]
    }
  }>({ action: 'session_exchange' })
}

export function pushMyDataMedHealthSignal(signal: NexOfficeHealthSignal) {
  return bridge<{
    ok: true
    privacy: 'aggregate_only'
    signal: {
      id: string
      workspace_id: string
      source_product: 'mydatamed'
      signal_type: string
      period_start: string
      period_end: string
      metrics: Record<string, number>
      dimensions: { window: NexOfficeHealthWindow; scope: NexOfficeHealthScope }
      created_at: string
    }
  }>({ action: 'health_signal', signal })
}

export async function getMyDataMedNexOfficeUrl() {
  await provisionMyDataMed()
  const handoff = await createMyDataMedHandoff()
  if (!handoff.url) throw new Error('NexOffice não retornou URL de handoff.')
  return handoff.url
}
