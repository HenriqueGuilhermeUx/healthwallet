import { AppLauncher } from '@capacitor/app-launcher'
import { Capacitor } from '@capacitor/core'
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

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '')
const HANDOFF_FUNCTION = 'healthwallet-connect-handoff'
const CONNECT_SCHEME = 'healthwallet-connect://handoff'

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
  error?: string
}

function clampDays(value: number | undefined) {
  if (!Number.isFinite(value)) return 30
  return Math.max(1, Math.min(90, Math.round(value || 30)))
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  }) as Promise<T>
}

function buildConnectUrl(data: Required<Pick<IssueResponse, 'code' | 'state'>> & IssueResponse) {
  const url = new URL(CONNECT_SCHEME)
  url.searchParams.set('code', data.code)
  url.searchParams.set('state', data.state)
  url.searchParams.set('profile', data.profile === 'full' ? 'full' : 'minimal')
  url.searchParams.set('metrics', (data.metrics || ['steps']).join(','))
  url.searchParams.set('days', String(data.days || 30))
  url.searchParams.set('autostart', '1')
  if (data.return_to) url.searchParams.set('return_to', data.return_to)
  return url.toString()
}

async function issueHandoff(body: Record<string, unknown>): Promise<IssueResponse> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Configuração do HealthWallet incompleta. Atualize o app de teste.')
  }

  const { data: sessionData, error: sessionError } = await withTimeout(
    supabase.auth.getSession(),
    4000,
    'Sua sessão demorou para responder. Feche e abra o HealthWallet Test e tente novamente.',
  )

  if (sessionError || !sessionData.session?.access_token) {
    throw new Error('Sua sessão expirou. Entre novamente no HealthWallet Test.')
  }

  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${HANDOFF_FUNCTION}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const payload = await response.json().catch(() => ({})) as IssueResponse

    if (!response.ok) {
      if (payload.error === 'unauthorized' || response.status === 401) {
        throw new Error('Sua sessão não pôde ser validada. Saia e entre novamente no HealthWallet Test.')
      }
      throw new Error('Não foi possível preparar a conexão segura com o HealthWallet Connect.')
    }

    return payload
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('A conexão segura demorou demais para responder. Tente novamente em alguns segundos.')
    }
    throw error
  } finally {
    clearTimeout(abortTimer)
  }
}

function openViaWebViewFallback(url: string) {
  return new Promise<void>((resolve, reject) => {
    let finished = false

    const cleanup = () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }

    const complete = (success: boolean) => {
      if (finished) return
      finished = true
      cleanup()
      if (success) resolve()
      else reject(new Error('O HealthWallet Connect não abriu. Confirme se ele está instalado e tente novamente.'))
    }

    const onVisibilityChange = () => {
      if (document.hidden) complete(true)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.location.assign(url)

    setTimeout(() => complete(document.hidden), 1800)
  })
}

async function openConnectApp(url: string) {
  if (Capacitor.isNativePlatform()) {
    const availability = await withTimeout(
      AppLauncher.canOpenUrl({ url: CONNECT_SCHEME }),
      3000,
      'Não foi possível verificar o HealthWallet Connect neste aparelho.',
    )

    if (!availability.value) {
      throw new Error('O HealthWallet Connect não está instalado ou não está disponível neste aparelho.')
    }

    try {
      const result = await withTimeout(
        AppLauncher.openUrl({ url }),
        4000,
        'A abertura do HealthWallet Connect demorou demais.',
      )

      if (result.completed) return
    } catch (error) {
      console.warn('Native Connect launcher fallback:', error)
    }

    await openViaWebViewFallback(url)
    return
  }

  window.location.assign(url)
}

export async function launchHealthWalletConnect(options: LaunchHealthWalletConnectOptions = {}) {
  const profile: HealthWalletConnectProfile = options.profile === 'minimal' ? 'minimal' : 'full'
  const metrics = profile === 'minimal'
    ? (['steps'] as HealthWalletConnectMetric[])
    : (options.metrics?.length ? Array.from(new Set(options.metrics)) : FULL_METRICS)
  const days = clampDays(options.days)
  const state = crypto.randomUUID()
  const returnTo = 'healthwallet://connect-complete'

  const data = await issueHandoff({
    action: 'issue',
    profile,
    metrics,
    days,
    return_to: returnTo,
    state,
  })

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

  await openConnectApp(connectUrl)

  return {
    state: data.state || state,
    expiresAt: data.expires_at || null,
    profile: data.profile || profile,
    metrics: data.metrics || metrics,
    days: data.days || days,
  }
}
