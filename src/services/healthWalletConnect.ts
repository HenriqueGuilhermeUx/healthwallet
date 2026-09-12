import { supabase } from '@/lib/supabase'

export type HealthWalletConnectProfile = 'minimal' | 'full'

export type HealthWalletConnectMetric =
  | 'steps'
  | 'sleep'
  | 'heartRate'
  | 'restingHeartRate'
  | 'oxygenSaturation'
  | 'heartRateVariability'
  | 'bloodPressure'
  | 'weight'
  | 'calories'
  | 'exerciseTime'

const FULL_METRICS: HealthWalletConnectMetric[] = [
  'steps',
  'sleep',
  'heartRate',
  'restingHeartRate',
  'oxygenSaturation',
  'heartRateVariability',
  'bloodPressure',
  'weight',
  'calories',
  'exerciseTime',
]

export type LaunchHealthWalletConnectOptions = {
  profile?: HealthWalletConnectProfile
  metrics?: HealthWalletConnectMetric[]
  days?: number
}

type IssueResponse = {
  code?: string
  state?: string
  profile?: HealthWalletConnectProfile
  metrics?: HealthWalletConnectMetric[]
  days?: number
  return_to?: string
  expires_at?: string
}

function clampDays(value: number | undefined) {
  if (!Number.isFinite(value)) return 30
  return Math.max(1, Math.min(90, Math.round(value || 30)))
}

function buildConnectUrl(data: Required<Pick<IssueResponse, 'code' | 'state'>> & IssueResponse) {
  const url = new URL('healthwallet-connect://handoff')
  url.searchParams.set('code', data.code)
  url.searchParams.set('state', data.state)
  url.searchParams.set('profile', data.profile === 'full' ? 'full' : 'minimal')
  url.searchParams.set('metrics', (data.metrics || ['steps']).join(','))
  url.searchParams.set('days', String(data.days || 30))
  url.searchParams.set('autostart', '1')
  if (data.return_to) url.searchParams.set('return_to', data.return_to)
  return url.toString()
}

export async function launchHealthWalletConnect(options: LaunchHealthWalletConnectOptions = {}) {
  const profile: HealthWalletConnectProfile = options.profile === 'minimal' ? 'minimal' : 'full'
  const metrics = profile === 'minimal'
    ? (['steps'] as HealthWalletConnectMetric[])
    : (options.metrics?.length ? Array.from(new Set(options.metrics)) : FULL_METRICS)
  const days = clampDays(options.days)
  const state = crypto.randomUUID()
  const returnTo = 'healthwallet://connect-complete'

  const { data, error } = await supabase.functions.invoke<IssueResponse>('healthwallet-connect-handoff', {
    body: {
      action: 'issue',
      profile,
      metrics,
      days,
      return_to: returnTo,
      state,
    },
  })

  if (error) throw new Error(error.message || 'Não foi possível preparar o HealthWallet Connect.')
  if (!data?.code) throw new Error('O HealthWallet Connect não retornou um código de conexão.')

  const connectUrl = buildConnectUrl({
    ...data,
    code: data.code,
    state: data.state || state,
    profile: data.profile || profile,
    metrics: data.metrics || metrics,
    days: data.days || days,
    return_to: data.return_to || returnTo,
  })

  window.location.assign(connectUrl)

  return {
    state: data.state || state,
    expiresAt: data.expires_at || null,
    profile: data.profile || profile,
    metrics: data.metrics || metrics,
    days: data.days || days,
  }
}
