import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase'

export type HealthMetric =
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

export type NativeProvider = 'health_connect' | 'apple_health'

export const METRICS: Array<{
  id: HealthMetric
  label: string
  shortLabel: string
  description: string
}> = [
  { id: 'steps', label: 'Passos', shortLabel: 'Passos', description: 'Movimento e atividade diária.' },
  { id: 'sleep', label: 'Sono', shortLabel: 'Sono', description: 'Duração registrada do sono.' },
  { id: 'heartRate', label: 'Frequência cardíaca', shortLabel: 'Batimentos', description: 'Média de frequência cardíaca autorizada.' },
  { id: 'restingHeartRate', label: 'Frequência em repouso', shortLabel: 'FC repouso', description: 'Frequência cardíaca de repouso.' },
  { id: 'oxygenSaturation', label: 'Saturação de oxigênio', shortLabel: 'SpO₂', description: 'Saturação registrada pelo dispositivo.' },
  { id: 'heartRateVariability', label: 'Variabilidade cardíaca', shortLabel: 'HRV', description: 'Variabilidade da frequência cardíaca.' },
  { id: 'bloodPressure', label: 'Pressão arterial', shortLabel: 'Pressão', description: 'Pressão sistólica e diastólica registrada.' },
  { id: 'weight', label: 'Peso', shortLabel: 'Peso', description: 'Histórico de peso autorizado.' },
  { id: 'calories', label: 'Calorias ativas', shortLabel: 'Calorias', description: 'Gasto energético relacionado à atividade.' },
  { id: 'exerciseTime', label: 'Tempo de atividade', shortLabel: 'Atividade', description: 'Minutos de exercício ou atividade.' },
]

type HealthSample = {
  value?: number
  systolic?: number
  diastolic?: number
  unit?: string
  startDate?: string
  endDate?: string
  sourceName?: string
  sourceId?: string
}

type HealthPlugin = {
  isAvailable: () => Promise<{ available?: boolean; reason?: string; platform?: string }>
  requestAuthorization: (options: { read?: HealthMetric[]; write?: HealthMetric[]; requestHistoryAccess?: boolean }) => Promise<unknown>
  checkAuthorization?: (options: { read?: HealthMetric[]; write?: HealthMetric[] }) => Promise<any>
  queryAggregated?: (options: {
    dataType: HealthMetric
    startDate: string
    endDate: string
    bucket?: 'hour' | 'day' | 'week' | 'month'
    aggregation?: 'sum' | 'average' | 'min' | 'max'
  }) => Promise<{ samples?: HealthSample[] }>
  readSamples?: (options: {
    dataType: HealthMetric
    startDate: string
    endDate: string
    limit?: number
  }) => Promise<{ samples?: HealthSample[] }>
  openHealthConnectSettings?: () => Promise<void>
}

export type DailySummary = {
  summary_date: string
  steps?: number | null
  sleep_minutes?: number | null
  resting_heart_rate?: number | null
  avg_heart_rate?: number | null
  hrv_avg?: number | null
  spo2_avg?: number | null
  systolic_bp?: number | null
  diastolic_bp?: number | null
  weight_kg?: number | null
  active_calories?: number | null
  activity_minutes?: number | null
}

export function currentProvider(): NativeProvider | null {
  if (Capacitor.getPlatform() === 'android') return 'health_connect'
  if (Capacitor.getPlatform() === 'ios') return 'apple_health'
  return null
}

export function providerLabel(provider: NativeProvider | null) {
  if (provider === 'health_connect') return 'Health Connect'
  if (provider === 'apple_health') return 'Apple Saúde'
  return 'Dispositivo de saúde'
}

async function loadPlugin(): Promise<HealthPlugin> {
  const module = await import('@capgo/capacitor-health')
  const plugin = (module as any).Health as HealthPlugin
  if (!plugin) throw new Error('Módulo nativo de saúde não encontrado neste build.')
  return plugin
}

export async function getHealthAvailability() {
  const provider = currentProvider()
  if (!provider || !Capacitor.isNativePlatform()) {
    return { available: false, provider: null, reason: 'Abra o HealthWallet Connect instalado no celular.' }
  }

  try {
    const plugin = await loadPlugin()
    const result = await plugin.isAvailable()
    return {
      available: Boolean(result?.available),
      provider,
      platform: result?.platform || Capacitor.getPlatform(),
      reason: result?.reason || null,
    }
  } catch (error: any) {
    return { available: false, provider, reason: error?.message || 'Integração de saúde indisponível.' }
  }
}

export async function requestHealthAccess(metrics: HealthMetric[]) {
  if (!metrics.length) throw new Error('Selecione pelo menos um dado para sincronizar.')
  const plugin = await loadPlugin()
  return plugin.requestAuthorization({ read: metrics, requestHistoryAccess: true })
}

export async function openHealthSettings() {
  const plugin = await loadPlugin()
  if (currentProvider() === 'health_connect' && plugin.openHealthConnectSettings) {
    await plugin.openHealthConnectSettings()
  }
}

export async function syncHealthData(userId: string, metrics: HealthMetric[], days = 30) {
  if (!userId) throw new Error('Usuário não autenticado.')
  if (!metrics.length) throw new Error('Selecione os dados que deseja sincronizar.')

  const provider = currentProvider()
  if (!provider) throw new Error('Sincronização nativa disponível somente no app instalado.')

  const plugin = await loadPlugin()
  const availability = await plugin.isAvailable()
  if (!availability?.available) throw new Error(availability?.reason || 'Fonte de saúde indisponível.')

  await requestHealthAccess(metrics)
  await upsertConnection(userId, provider, metrics)

  const safeDays = Math.max(1, Math.min(90, days))
  const summaries = await readDailySummaries(plugin, metrics, safeDays)
  let synced = 0

  for (const summary of summaries) {
    const { data: existing, error: existingError } = await supabase
      .from('health_daily_summaries')
      .select('*')
      .eq('user_id', userId)
      .eq('summary_date', summary.summary_date)
      .maybeSingle()

    if (existingError) throw existingError

    const merged = mergeSummary(existing, summary)
    const sources = Array.from(new Set([...(Array.isArray(existing?.sources) ? existing.sources : []), provider]))

    const payload = {
      user_id: userId,
      summary_date: summary.summary_date,
      sources,
      ...merged,
      data_points: countMetrics({ summary_date: summary.summary_date, ...merged }),
      metadata: {
        ...(existing?.metadata || {}),
        source_app: 'healthwallet_connect',
        provider,
        patient_controlled: true,
        selected_metrics: metrics,
        sync_version: 1,
        merge_safe: true,
      },
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('health_daily_summaries')
      .upsert(payload, { onConflict: 'user_id,summary_date' })

    if (error) throw error
    synced += 1
  }

  await supabase
    .from('health_device_connections')
    .update({ status: 'connected', last_sync_at: new Date().toISOString(), scopes_authorized: metrics })
    .eq('user_id', userId)
    .eq('provider', provider)

  return { provider, daysRequested: safeDays, daysSynced: synced, metrics }
}

async function upsertConnection(userId: string, provider: NativeProvider, metrics: HealthMetric[]) {
  const { data: existing } = await supabase
    .from('health_device_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', provider)
    .neq('status', 'revoked')
    .maybeSingle()

  const payload = {
    user_id: userId,
    provider,
    display_name: providerLabel(provider),
    source_device: providerLabel(provider),
    status: 'connected',
    scopes_authorized: metrics,
    last_sync_at: new Date().toISOString(),
    metadata: {
      source_app: 'healthwallet_connect',
      patient_controlled: true,
      consent_required_for_sharing: true,
      permission_strategy: 'selective_user_opt_in',
    },
  }

  if (existing?.id) {
    const { error } = await supabase.from('health_device_connections').update(payload).eq('id', existing.id)
    if (error) throw error
    return
  }

  const { error } = await supabase.from('health_device_connections').insert(payload)
  if (error) throw error
}

async function readDailySummaries(plugin: HealthPlugin, metrics: HealthMetric[], days: number) {
  const output: DailySummary[] = []

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const start = startOfDay(offset)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)

    const summary: DailySummary = { summary_date: localIsoDate(start) }

    for (const metric of metrics) {
      if (metric === 'bloodPressure') {
        const bp = await readBloodPressure(plugin, start, end)
        summary.systolic_bp = bp.systolic
        summary.diastolic_bp = bp.diastolic
        continue
      }

      const aggregation = metric === 'steps' || metric === 'sleep' || metric === 'calories' || metric === 'exerciseTime'
        ? 'sum'
        : 'average'
      const value = await readMetric(plugin, metric, start, end, aggregation)

      if (metric === 'steps') summary.steps = round(value, 0)
      if (metric === 'sleep') summary.sleep_minutes = round(value, 0)
      if (metric === 'heartRate') summary.avg_heart_rate = round(value, 0)
      if (metric === 'restingHeartRate') summary.resting_heart_rate = round(value, 0)
      if (metric === 'oxygenSaturation') summary.spo2_avg = round(normalizePercent(value), 1)
      if (metric === 'heartRateVariability') summary.hrv_avg = round(value, 1)
      if (metric === 'weight') summary.weight_kg = round(value, 2)
      if (metric === 'calories') summary.active_calories = round(value, 0)
      if (metric === 'exerciseTime') summary.activity_minutes = round(value, 0)
    }

    if (countMetrics(summary) > 0) output.push(summary)
  }

  return output
}

function mergeSummary(existing: any, incoming: DailySummary) {
  return {
    steps: preferIncoming(incoming.steps, existing?.steps),
    sleep_minutes: preferIncoming(incoming.sleep_minutes, existing?.sleep_minutes),
    resting_heart_rate: preferIncoming(incoming.resting_heart_rate, existing?.resting_heart_rate),
    avg_heart_rate: preferIncoming(incoming.avg_heart_rate, existing?.avg_heart_rate),
    hrv_avg: preferIncoming(incoming.hrv_avg, existing?.hrv_avg),
    spo2_avg: preferIncoming(incoming.spo2_avg, existing?.spo2_avg),
    systolic_bp: preferIncoming(incoming.systolic_bp, existing?.systolic_bp),
    diastolic_bp: preferIncoming(incoming.diastolic_bp, existing?.diastolic_bp),
    weight_kg: preferIncoming(incoming.weight_kg, existing?.weight_kg),
    active_calories: preferIncoming(incoming.active_calories, existing?.active_calories),
    activity_minutes: preferIncoming(incoming.activity_minutes, existing?.activity_minutes),
  }
}

function preferIncoming(incoming: unknown, existing: unknown) {
  const fresh = nullable(incoming)
  if (fresh !== null) return fresh
  return nullable(existing)
}

async function readMetric(
  plugin: HealthPlugin,
  dataType: HealthMetric,
  start: Date,
  end: Date,
  aggregation: 'sum' | 'average'
) {
  try {
    if (plugin.queryAggregated) {
      const result = await plugin.queryAggregated({
        dataType,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        bucket: 'day',
        aggregation,
      })
      return reduce(result?.samples || [], aggregation)
    }

    if (plugin.readSamples) {
      const result = await plugin.readSamples({
        dataType,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        limit: 2000,
      })
      return reduce(result?.samples || [], aggregation)
    }
  } catch (error) {
    console.warn(`HealthWallet Connect skipped ${dataType}:`, error)
  }

  return null
}

async function readBloodPressure(plugin: HealthPlugin, start: Date, end: Date) {
  try {
    if (!plugin.readSamples) return { systolic: null, diastolic: null }
    const result = await plugin.readSamples({
      dataType: 'bloodPressure',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      limit: 500,
    })
    const samples = result?.samples || []
    return {
      systolic: average(samples.map((sample) => sample.systolic)),
      diastolic: average(samples.map((sample) => sample.diastolic)),
    }
  } catch {
    return { systolic: null, diastolic: null }
  }
}

function reduce(samples: HealthSample[], mode: 'sum' | 'average') {
  const values = samples.map((item) => Number(item.value)).filter((value) => Number.isFinite(value) && value >= 0)
  if (!values.length) return null
  if (mode === 'sum') return values.reduce((total, value) => total + value, 0)
  return values.reduce((total, value) => total + value, 0) / values.length
}

function average(values: Array<number | null | undefined>) {
  const valid = values.map(Number).filter((value) => Number.isFinite(value) && value > 0)
  if (!valid.length) return null
  return valid.reduce((total, value) => total + value, 0) / valid.length
}

function normalizePercent(value: number | null) {
  if (value == null) return null
  return value > 0 && value <= 1 ? value * 100 : value
}

function round(value: number | null, decimals: number) {
  if (value == null || !Number.isFinite(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function nullable(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function countMetrics(summary: DailySummary) {
  return [
    summary.steps,
    summary.sleep_minutes,
    summary.resting_heart_rate,
    summary.avg_heart_rate,
    summary.hrv_avg,
    summary.spo2_avg,
    summary.systolic_bp,
    summary.diastolic_bp,
    summary.weight_kg,
    summary.active_calories,
    summary.activity_minutes,
  ].filter((value) => nullable(value) !== null).length
}

function startOfDay(offset: number) {
  const date = new Date()
  date.setDate(date.getDate() - offset)
  date.setHours(0, 0, 0, 0)
  return date
}

function localIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
