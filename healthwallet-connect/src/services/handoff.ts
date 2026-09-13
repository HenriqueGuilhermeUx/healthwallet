import { App } from '@capacitor/app'
import { AppLauncher } from '@capacitor/app-launcher'
import { Capacitor } from '@capacitor/core'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { HealthMetric, METRICS } from './healthSync'

export type ConnectProfile = 'minimal' | 'full'

export type ConnectHandoff = {
  code?: string
  state?: string
  profile: ConnectProfile
  metrics: HealthMetric[]
  days: number
  autostart: boolean
  returnTo?: string
}

type RedeemResponse = {
  token_hash?: string
  profile?: ConnectProfile
  metrics?: HealthMetric[]
  days?: number
  return_to?: string
  state?: string
  error?: string
}

const ALL_METRICS = METRICS.map((metric) => metric.id)
const ALLOWED_METRICS = new Set<HealthMetric>(ALL_METRICS)
const DEFAULT_RETURN_PROTOCOL = 'healthwallet:'

function clampDays(value: number) {
  if (!Number.isFinite(value)) return 30
  return Math.max(1, Math.min(90, Math.round(value)))
}

function parseMetrics(raw: string | null, profile: ConnectProfile) {
  if (profile === 'minimal') return ['steps'] as HealthMetric[]
  if (!raw) return [...ALL_METRICS]

  const requested = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is HealthMetric => ALLOWED_METRICS.has(item as HealthMetric))

  return requested.length ? Array.from(new Set(requested)) : [...ALL_METRICS]
}

function isAllowedReturnUrl(value: string | null) {
  if (!value) return false

  try {
    const url = new URL(value)
    if (url.protocol === DEFAULT_RETURN_PROTOCOL) return true

    const configuredOrigin = String(import.meta.env.VITE_HEALTHWALLET_WEB_ORIGIN || '').trim()
    if (configuredOrigin && /^https?:$/.test(url.protocol)) {
      return url.origin === new URL(configuredOrigin).origin
    }

    return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

function redeemErrorMessage(code?: string) {
  if (code === 'invalid_or_expired_handoff') return 'Esta conexão segura já foi usada ou expirou. Volte à HealthWallet e abra o Connect novamente.'
  if (code === 'handoff_redeem_failed') return 'O Connect não conseguiu resgatar a conexão segura no banco. Tente novamente pela HealthWallet.'
  if (code === 'handoff_user_unavailable') return 'A conta foi reconhecida, mas não foi possível preparar a sessão do Connect.'
  if (code === 'handoff_session_failed') return 'A conta foi reconhecida, mas a sessão automática do Connect não pôde ser criada.'
  if (code === 'handoff_token_unavailable') return 'A sessão foi preparada, mas o token temporário não ficou disponível.'
  if (code === 'invalid_handoff') return 'O código de conexão recebido é inválido.'
  return 'Não foi possível validar a conexão segura com a HealthWallet.'
}

async function parseInvokeError(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json() as RedeemResponse
      if (payload?.error) return redeemErrorMessage(payload.error)
    } catch {
      // Fall back to the SDK error below.
    }
  }

  const message = String((error as any)?.message || '').trim()
  return message && message !== 'Edge Function returned a non-2xx status code'
    ? message
    : 'Não foi possível validar a conexão segura com a HealthWallet.'
}

export function parseHandoffUrl(rawUrl?: string | null): ConnectHandoff | null {
  if (!rawUrl) return null

  try {
    const url = new URL(rawUrl)
    const isNativeScheme = url.protocol === 'healthwallet-connect:' && url.hostname === 'handoff'
    const isWebHandoff = /^https?:$/.test(url.protocol) && (url.pathname === '/handoff' || url.searchParams.has('connect_handoff'))

    if (!isNativeScheme && !isWebHandoff) return null

    const profile: ConnectProfile = url.searchParams.get('profile') === 'full' ? 'full' : 'minimal'
    const returnTo = url.searchParams.get('return_to')

    return {
      code: url.searchParams.get('code') || undefined,
      state: url.searchParams.get('state') || undefined,
      profile,
      metrics: parseMetrics(url.searchParams.get('metrics'), profile),
      days: clampDays(Number(url.searchParams.get('days') || 30)),
      autostart: url.searchParams.get('autostart') !== '0',
      returnTo: isAllowedReturnUrl(returnTo) ? returnTo || undefined : undefined,
    }
  } catch {
    return null
  }
}

export async function getInitialHandoff() {
  if (Capacitor.isNativePlatform()) {
    try {
      const launch = await App.getLaunchUrl()
      const parsed = parseHandoffUrl(launch?.url)
      if (parsed) return parsed
    } catch {
      // Fall through to the browser URL for web/dev builds.
    }
  }

  return parseHandoffUrl(window.location.href)
}

export function subscribeToHandoffs(callback: (handoff: ConnectHandoff) => void) {
  if (!Capacitor.isNativePlatform()) return () => undefined

  let disposed = false
  let remove: (() => void | Promise<void>) | null = null

  Promise.resolve(App.addListener('appUrlOpen', ({ url }) => {
    const handoff = parseHandoffUrl(url)
    if (handoff) callback(handoff)
  })).then((handle) => {
    if (disposed) {
      void handle.remove()
      return
    }
    remove = () => handle.remove()
  }).catch(() => undefined)

  return () => {
    disposed = true
    if (remove) void remove()
  }
}

export async function redeemHandoff(handoff: ConnectHandoff): Promise<ConnectHandoff> {
  if (!handoff.code) return handoff

  const { data, error } = await supabase.functions.invoke<RedeemResponse>('healthwallet-connect-handoff', {
    body: { action: 'redeem', code: handoff.code },
  })

  if (error) throw new Error(await parseInvokeError(error))
  if (!data?.token_hash) throw new Error(redeemErrorMessage(data?.error))

  const { error: authError } = await supabase.auth.verifyOtp({
    token_hash: data.token_hash,
    type: 'email',
  })

  if (authError) throw new Error(authError.message || 'Não foi possível abrir sua sessão no Connect.')

  const profile = data.profile === 'full' ? 'full' : handoff.profile
  const responseMetrics = Array.isArray(data.metrics)
    ? data.metrics.filter((item): item is HealthMetric => ALLOWED_METRICS.has(item as HealthMetric))
    : []

  return {
    ...handoff,
    profile,
    metrics: profile === 'minimal'
      ? ['steps']
      : (responseMetrics.length ? responseMetrics : handoff.metrics),
    days: clampDays(Number(data.days || handoff.days)),
    returnTo: isAllowedReturnUrl(data.return_to || null) ? data.return_to : handoff.returnTo,
    state: data.state || handoff.state,
    code: undefined,
  }
}

export async function returnToHealthWallet(
  handoff: ConnectHandoff,
  result: { status: 'success' | 'error'; provider?: string | null; daysSynced?: number; message?: string }
) {
  if (!handoff.returnTo) return false

  try {
    const url = new URL(handoff.returnTo)
    url.searchParams.set('connect_status', result.status)
    if (handoff.state) url.searchParams.set('state', handoff.state)
    if (result.provider) url.searchParams.set('provider', result.provider)
    if (typeof result.daysSynced === 'number') url.searchParams.set('days_synced', String(result.daysSynced))
    if (result.message) url.searchParams.set('message', result.message.slice(0, 180))

    const target = url.toString()
    if (Capacitor.isNativePlatform()) {
      const opened = await AppLauncher.openUrl({ url: target })
      return opened.completed
    }

    window.location.assign(target)
    return true
  } catch {
    return false
  }
}
