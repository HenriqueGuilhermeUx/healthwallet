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

export type HealthConnectDiagnostics = {
  packageName?: string
  manufacturer?: string
  model?: string
  androidSdk?: number
  healthConnectSdkStatus?: number
  healthConnectSdkStatusLabel?: string
  permissionIntentAction?: string
  permissionIntentResolvable?: boolean
  managePermissionsIntentResolvable?: boolean
  settingsIntentResolvable?: boolean
  requestedPermissionCount?: number
  requestedPermissions?: string[]
  manifestHealthPermissions?: string[]
  missingManifestPermissions?: string[]
  allRequestedPermissionsDeclared?: boolean
  error?: string
}

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
    ascending?: boolean
  }) => Promise<{ samples?: HealthSample[] }>
  getHealthConnectDiagnostics?: (options: { read?: HealthMetric[]; write?: HealthMetric[] }) => Promise<HealthConnectDiagnostics>
  openHealthPermissions?: () => Promise<{ route?: string }>
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

const NATIVE_TIMEOUT_MS = 9000

class NativeHealthTimeoutError extends Error {
  constructor(label: string) {
    super(`${label} não respondeu em ${Math.round(NATIVE_TIMEOUT_MS / 1000)} segundos.`)
    this.name = 'NativeHealthTimeoutError'
  }
}

function withNativeTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: number | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => reject(new NativeHealthTimeoutError(label)), NATIVE_TIMEOUT_MS)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) window.clearTimeout(timer)
  })
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

function nativeMetrics(metrics: HealthMetric[]) {
  if (currentProvider() !== 'health_connect') return metrics
  return metrics.filter((metric) => metric !== 'exerciseTime')
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
    const result = await withNativeTimeout(plugin.isAvailable(), providerLabel(provider))
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

async function requestAuthorizationWithPlugin(plugin: HealthPlugin, metrics: HealthMetric[]) {
  const requested = nativeMetrics(metrics)
  if (!requested.length) throw new Error('Selecione pelo menos um dado compatível com este aparelho.')

  try {
    return await plugin.requestAuthorization({ read: requested })
  } catch (error: any) {
    const nativeMessage = String(error?.message || '').trim()
    if (currentProvider() === 'health_connect') {
      throw new Error(nativeMessage
        ? `O Health Connect não conseguiu abrir as permissões: ${nativeMessage}`
        : 'O Health Connect não conseguiu abrir as permissões neste aparelho.')
    }
    throw error
  }
}

export async function requestHealthAccess(metrics: HealthMetric[]) {
  if (!metrics.length) throw new Error('Selecione pelo menos um dado para sincronizar.')
  const plugin = await loadPlugin()
  return requestAuthorizationWithPlugin(plugin, metrics)
}

export async function getHealthDiagnostics(metrics: HealthMetric[]): Promise<HealthConnectDiagnostics> {
  if (currentProvider() !== 'health_connect') {
    return { error: 'Diagnóstico nativo disponível somente no Android/Health Connect.' }
  }

  const plugin = await loadPlugin()
  if (!plugin.getHealthConnectDiagnostics) {
    return { error: 'Este build não contém a ponte nativa de diagnóstico.' }
  }

  return plugin.getHealthConnectDiagnostics({ read: nativeMetrics(metrics) })
}

export async function openHealthPermissionManager() {
  const plugin = await loadPlugin()
  if (currentProvider() !== 'health_connect') return { route: 'unsupported' }

  if (plugin.openHealthPermissions) {
    return plugin.openHealthPermissions()
  }

  if (plugin.openHealthConnectSettings) {
    await plugin.openHealthConnectSettings()
    return { route: 'health_connect_settings' }
  }

  throw new Error('Este build não consegue abrir as permissões do Health Connect diretamente.')
}

export async function openHealthSettings() {
  const plugin = await loadPlugin()
  if (currentProvider() === 'health_connect' && plugin.openHealthConnectSettings) {
    await plugin.openHealthConnectSettings()
  }
}

export async function probeHealthAccess(metric: HealthMetric) {
  const plugin = await loadPlugin()
  const safeMetric = currentProvider() === 'health_connect' && metric === 'exerciseTime' ? 'steps' : metric
  const end = new Date()
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)

  if (plugin.queryAggregated && safeMetric !== 'sleep' && safeMetric !== 'bloodPressure') {
    const result = await withNativeTimeout(
      plugin.queryAggregated({
        dataType: safeMetric,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        bucket: 'day',
        aggregation: metricAggregation(safeMetric),
      }),
      `Agregação de ${safeMetric}`,
    )
    return { ok: true, sampleCount: result?.samples?.length || 0, mode: 'aggregate' as const }
  }

  if (!plugin.readSamples) throw new Error('Leitura nativa não está disponível neste build.')
  const result = await withNativeTimeout(
    plugin.readSamples({
      dataType: safeMetric,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      limit: 10,
      ascending: true,
    }),
    `Leitura de ${safeMetric}`,
  )
  return { ok: true, sampleCount: result?.samples?.length || 0, mode: 'samples' as const }
}

export async function syncHealthData(
  userId: string,
  metrics: HealthMetric[],
  days = 30,
  options: { skipAuthorization?: boolean } = {},
) {
  if (!userId) throw new Error('Usuário não autenticado.')
  if (!metrics.length) throw new Error('Selecione os dados que deseja sincronizar.')

  const provider = currentProvider()
  if (!provider) throw new Error('Sincronização nativa disponível somente no app instalado.')

  const effectiveMetrics = nativeMetrics(metrics)
  if (!effectiveMetrics.length) throw new Error('Nenhum dado compatível selecionado para este aparelho.')

  const plugin = await loadPlugin()

  if (provider === 'apple_health') {
    const availability = await withNativeTimeout(plugin.isAvailable(), 'Apple Saúde')
    if (!availability?.available) throw new Error(availability?.reason || 'Apple Saúde indisponível.')
  }

  // IMPORTANT: when the caller already completed authorization, go straight to
  // the real sync. The old implementation inserted a readSamples probe here;
  // on some Samsung/Health Connect combinations that probe could remain pending
  // forever and prevented the actual aggregate sync from ever starting.
  if (!options.skipAuthorization) {
    await requestAuthorizationWithPlugin(plugin, effectiveMetrics)
  }

  await upsertConnection(userId, provider, effectiveMetrics)

  const safeDays = Math.max(1, Math.min(90, days))
  const summaries = await readDailySummaries(plugin, effectiveMetrics, safeDays)

  if (!summaries.length) {
    return { provider, daysRequested: safeDays, daysSynced: 0, metrics: effectiveMetrics }
  }

  const firstDate = summaries[0].summary_date
  const lastDate = summaries[summaries.length - 1].summary_date
  const { data: existingRows, error: existingError } = await supabase
    .from('health_daily_summaries')
    .select('*')
    .eq('user_id', userId)
    .gte('summary_date', firstDate)
    .lte('summary_date', lastDate)

  if (existingError) throw existingError

  const existingByDate = new Map((existingRows || []).map((row: any) => [row.summary_date, row]))
  const now = new Date().toISOString()

  const payloads = summaries.map((summary) => {
    const existing: any = existingByDate.get(summary.summary_date)
    const merged = mergeSummary(existing, summary)
    const sources = Array.from(new Set([...(Array.isArray(existing?.sources) ? existing.sources : []), provider]))

    return {
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
        selected_metrics: effectiveMetrics,
        sync_version: 2,
        merge_safe: true,
        read_strategy: 'range_aggregate_with_sample_fallback',
      },
      last_sync_at: now,
      updated_at: now,
    }
  })

  const { error: upsertError } = await supabase
    .from('health_daily_summaries')
    .upsert(payloads, { onConflict: 'user_id,summary_date' })

  if (upsertError) throw upsertError

  await supabase
    .from('health_device_connections')
    .update({ status: 'connected', last_sync_at: now, scopes_authorized: effectiveMetrics })
    .eq('user_id', userId)
    .eq('provider', provider)

  return { provider, daysRequested: safeDays, daysSynced: summaries.length, metrics: effectiveMetrics }
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
      sync_version: 2,
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
  const summaries = new Map<string, DailySummary>()

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = startOfDay(offset)
    const key = localIsoDate(date)
    summaries.set(key, { summary_date: key })
  }

  const rangeStart = startOfDay(days - 1)
  const rangeEnd = new Date()

  for (const metric of metrics) {
    if (metric === 'exerciseTime') continue

    if (metric === 'bloodPressure') {
      await fillBloodPressureRange(plugin, summaries, rangeStart, rangeEnd)
      continue
    }

    const aggregation = metricAggregation(metric)
    const grouped = await readMetricRange(plugin, metric, rangeStart, rangeEnd, aggregation)

    for (const [date, value] of grouped.entries()) {
      const summary = summaries.get(date)
      if (!summary) continue
      applyMetric(summary, metric, value)
    }
  }

  return Array.from(summaries.values()).filter((summary) => countMetrics(summary) > 0)
}

function metricAggregation(metric: HealthMetric): 'sum' | 'average' {
  return metric === 'steps' || metric === 'sleep' || metric === 'calories' || metric === 'exerciseTime'
    ? 'sum'
    : 'average'
}

async function readMetricRange(
  plugin: HealthPlugin,
  dataType: HealthMetric,
  start: Date,
  end: Date,
  aggregation: 'sum' | 'average',
) {
  if (plugin.queryAggregated && dataType !== 'sleep') {
    try {
      const result = await withNativeTimeout(
        plugin.queryAggregated({
          dataType,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          bucket: 'day',
          aggregation,
        }),
        `Agregação de ${dataType}`,
      )

      const grouped = new Map<string, number>()
      for (const sample of result?.samples || []) {
        const value = nullable(sample.value)
        const date = sampleDate(sample)
        if (value === null || !date) continue
        grouped.set(date, value)
      }
      return grouped
    } catch (error) {
      if (error instanceof NativeHealthTimeoutError) {
        console.warn(`HealthWallet Connect timed out aggregating ${dataType}; skipping this metric.`)
        return new Map<string, number>()
      }
      console.warn(`Aggregate unsupported/failed for ${dataType}; trying samples.`, error)
    }
  }

  if (!plugin.readSamples) return new Map<string, number>()

  try {
    const result = await withNativeTimeout(
      plugin.readSamples({
        dataType,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        limit: 5000,
        ascending: true,
      }),
      `Leitura de ${dataType}`,
    )

    return groupSamplesByDay(result?.samples || [], aggregation)
  } catch (error) {
    console.warn(`HealthWallet Connect skipped ${dataType}:`, error)
    return new Map<string, number>()
  }
}

async function fillBloodPressureRange(
  plugin: HealthPlugin,
  summaries: Map<string, DailySummary>,
  start: Date,
  end: Date,
) {
  if (!plugin.readSamples) return

  try {
    const result = await withNativeTimeout(
      plugin.readSamples({
        dataType: 'bloodPressure',
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        limit: 2000,
        ascending: true,
      }),
      'Leitura de pressão arterial',
    )

    const grouped = new Map<string, { systolic: number[]; diastolic: number[] }>()
    for (const sample of result?.samples || []) {
      const date = sampleDate(sample)
      if (!date || !summaries.has(date)) continue
      if (!grouped.has(date)) grouped.set(date, { systolic: [], diastolic: [] })
      const bucket = grouped.get(date)!
      const systolic = nullable(sample.systolic)
      const diastolic = nullable(sample.diastolic)
      if (systolic !== null && systolic > 0) bucket.systolic.push(systolic)
      if (diastolic !== null && diastolic > 0) bucket.diastolic.push(diastolic)
    }

    for (const [date, bucket] of grouped.entries()) {
      const summary = summaries.get(date)
      if (!summary) continue
      summary.systolic_bp = round(average(bucket.systolic), 0)
      summary.diastolic_bp = round(average(bucket.diastolic), 0)
    }
  } catch (error) {
    console.warn('HealthWallet Connect skipped blood pressure:', error)
  }
}

function groupSamplesByDay(samples: HealthSample[], mode: 'sum' | 'average') {
  const buckets = new Map<string, number[]>()
  for (const sample of samples) {
    const date = sampleDate(sample)
    const value = nullable(sample.value)
    if (!date || value === null || value < 0) continue
    const values = buckets.get(date) || []
    values.push(value)
    buckets.set(date, values)
  }

  const grouped = new Map<string, number>()
  for (const [date, values] of buckets.entries()) {
    if (!values.length) continue
    const value = mode === 'sum'
      ? values.reduce((total, item) => total + item, 0)
      : values.reduce((total, item) => total + item, 0) / values.length
    grouped.set(date, value)
  }
  return grouped
}

function sampleDate(sample: HealthSample) {
  const raw = sample.startDate || sample.endDate
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : localIsoDate(date)
}

function applyMetric(summary: DailySummary, metric: HealthMetric, value: number) {
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
