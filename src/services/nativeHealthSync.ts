import { Capacitor } from '@capacitor/core'
import {
  connectDeviceProvider,
  DeviceDailySummaryInput,
  DeviceProvider,
  upsertDeviceDailySummary,
} from '@/services/deviceData'

export type NativeSyncProvider = 'health_connect' | 'apple_health'

type HealthDataType =
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

type HealthSample = {
  value?: number
  unit?: string
  startDate?: string
  endDate?: string
  sourceName?: string
  sourceId?: string
  platformId?: string
  systolic?: number
  diastolic?: number
  sleepState?: string
}

type NativeHealthModule = {
  isAvailable: () => Promise<{ available?: boolean; platform?: string; reason?: string }>
  requestAuthorization: (options: { read?: HealthDataType[]; write?: HealthDataType[]; requestHistoryAccess?: boolean }) => Promise<any>
  checkAuthorization?: (options: { read?: HealthDataType[]; write?: HealthDataType[] }) => Promise<any>
  queryAggregated?: (options: { dataType: HealthDataType; startDate: string; endDate: string; bucket?: 'hour' | 'day' | 'week' | 'month'; aggregation?: 'sum' | 'average' | 'min' | 'max' }) => Promise<{ samples?: HealthSample[] }>
  readSamples?: (options: { dataType: HealthDataType; startDate: string; endDate: string; limit?: number }) => Promise<{ samples?: HealthSample[] }>
  openHealthConnectSettings?: () => Promise<void>
  showPrivacyPolicy?: () => Promise<void>
}

type SyncOptions = {
  days?: number
  requestAuthorization?: boolean
  requestHistoryAccess?: boolean
}

const READ_TYPES: HealthDataType[] = [
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

export function getNativeProviderForPlatform(): NativeSyncProvider | null {
  const platform = Capacitor.getPlatform()
  if (platform === 'android') return 'health_connect'
  if (platform === 'ios') return 'apple_health'
  return null
}

export function isNativeHealthPlatform() {
  return Capacitor.isNativePlatform() && Boolean(getNativeProviderForPlatform())
}

export async function getNativeHealthAvailability() {
  const provider = getNativeProviderForPlatform()
  if (!provider) {
    return {
      available: false,
      provider: null,
      reason: 'Sincronização automática funciona no app instalado no celular, não no navegador.',
    }
  }

  try {
    const Health = await loadHealthPlugin()
    const availability = await Health.isAvailable()
    return {
      available: Boolean(availability?.available),
      provider,
      reason: availability?.reason || null,
      platform: availability?.platform || Capacitor.getPlatform(),
    }
  } catch (error: any) {
    return {
      available: false,
      provider,
      reason: error?.message || 'Plugin nativo de saúde indisponível neste build.',
    }
  }
}

export async function openNativeHealthSettings() {
  const Health = await loadHealthPlugin()
  if (Capacitor.getPlatform() === 'android' && Health.openHealthConnectSettings) {
    await Health.openHealthConnectSettings()
  }
}

export async function showNativeHealthPrivacyPolicy() {
  const Health = await loadHealthPlugin()
  if (Health.showPrivacyPolicy) await Health.showPrivacyPolicy()
}

export async function syncNativeHealthData(userId: string, provider?: NativeSyncProvider, options: SyncOptions = {}) {
  const nativeProvider = provider || getNativeProviderForPlatform()
  if (!nativeProvider) throw new Error('Abra a HealthWallet instalada no celular para sincronizar automaticamente.')

  const platformProvider = getNativeProviderForPlatform()
  if (platformProvider && nativeProvider !== platformProvider) {
    throw new Error(nativeProvider === 'apple_health' ? 'Apple Saúde só fica disponível no iPhone.' : 'Health Connect só fica disponível no Android.')
  }

  const Health = await loadHealthPlugin()
  const availability = await Health.isAvailable()
  if (!availability?.available) {
    throw new Error(availability?.reason || 'Fonte nativa de saúde indisponível neste aparelho.')
  }

  if (options.requestAuthorization !== false) {
    await Health.requestAuthorization({
      read: READ_TYPES,
      requestHistoryAccess: options.requestHistoryAccess ?? true,
    } as any)
  } else if (Health.checkAuthorization) {
    const status = await Health.checkAuthorization({ read: READ_TYPES })
    const authorized = Array.isArray(status?.readAuthorized) ? status.readAuthorized : []
    if (!authorized.length) throw new Error('Autorize o acesso aos dados de saúde antes da sincronização automática.')
  }

  await connectDeviceProvider(userId, nativeProvider as DeviceProvider)

  const days = Math.max(1, Math.min(30, options.days || 14))
  const summaries = await readDailySummaries(Health, days)
  const saved: Array<{ summary_date: string; device_context_score?: number | null }> = []

  for (const summary of summaries) {
    const result = await upsertDeviceDailySummary({
      ...summary,
      user_id: userId,
      sources: [nativeProvider],
      metadata: {
        ...(summary.metadata || {}),
        source_app: 'healthwallet_mobile',
        sync_mode: 'native_automatic',
        provider: nativeProvider,
        platform: Capacitor.getPlatform(),
      },
    })

    if (result.error) throw result.error
    saved.push({ summary_date: summary.summary_date, device_context_score: result.data?.device_context_score || null })
  }

  return {
    provider: nativeProvider,
    days_requested: days,
    days_synced: saved.length,
    saved,
    disclaimer: 'Dados de dispositivos pessoais são complementares e não substituem avaliação profissional.',
  }
}

async function loadHealthPlugin(): Promise<NativeHealthModule> {
  const module = await import('@capgo/capacitor-health')
  const Health = (module as any).Health as NativeHealthModule
  if (!Health) throw new Error('Plugin @capgo/capacitor-health não encontrado no app.')
  return Health
}

async function readDailySummaries(Health: NativeHealthModule, days: number): Promise<DeviceDailySummaryInput[]> {
  const items: DeviceDailySummaryInput[] = []

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const start = startOfLocalDay(offset)
    const end = endOfLocalDay(start)
    const summaryDate = toIsoDate(start)

    const [steps, sleep, avgHeartRate, restingHeartRate, spo2, hrv, calories, activityMinutes, weight, bp] = await Promise.all([
      readAggregate(Health, 'steps', start, end, 'sum'),
      readAggregate(Health, 'sleep', start, end, 'sum'),
      readAggregate(Health, 'heartRate', start, end, 'average'),
      readAggregate(Health, 'restingHeartRate', start, end, 'average'),
      readAggregate(Health, 'oxygenSaturation', start, end, 'average'),
      readAggregate(Health, 'heartRateVariability', start, end, 'average'),
      readAggregate(Health, 'calories', start, end, 'sum'),
      readAggregate(Health, 'exerciseTime', start, end, 'sum'),
      readLatestSampleValue(Health, 'weight', start, end),
      readLatestBloodPressure(Health, start, end),
    ])

    const summary: DeviceDailySummaryInput = {
      user_id: '',
      summary_date: summaryDate,
      sources: [],
      steps: normalizeInteger(steps),
      sleep_minutes: normalizeSleepMinutes(sleep),
      avg_heart_rate: normalizeNumber(avgHeartRate),
      resting_heart_rate: normalizeNumber(restingHeartRate),
      hrv_avg: normalizeNumber(hrv),
      spo2_avg: normalizeSpo2(spo2),
      systolic_bp: normalizeNumber(bp?.systolic),
      diastolic_bp: normalizeNumber(bp?.diastolic),
      weight_kg: normalizeNumber(weight),
      active_calories: normalizeNumber(calories),
      activity_minutes: normalizeNumber(activityMinutes),
      metadata: {
        day_start: start.toISOString(),
        day_end: end.toISOString(),
        native_read: true,
      },
    }

    if (hasAnyMetric(summary)) items.push(summary)
  }

  return items
}

async function readAggregate(
  Health: NativeHealthModule,
  dataType: HealthDataType,
  start: Date,
  end: Date,
  aggregation: 'sum' | 'average'
) {
  try {
    if (Health.queryAggregated) {
      const result = await Health.queryAggregated({
        dataType,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        bucket: 'day',
        aggregation,
      })
      return reduceSamples(result?.samples || [], aggregation)
    }

    if (Health.readSamples) {
      const result = await Health.readSamples({
        dataType,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        limit: 500,
      })
      return reduceSamples(result?.samples || [], aggregation)
    }
  } catch (error) {
    console.warn(`Native health read skipped for ${dataType}:`, error)
  }

  return null
}

async function readLatestSampleValue(Health: NativeHealthModule, dataType: HealthDataType, start: Date, end: Date) {
  try {
    if (!Health.readSamples) return null
    const result = await Health.readSamples({
      dataType,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      limit: 50,
    })
    const sample = latestSample(result?.samples || [])
    return sample?.value ?? null
  } catch (error) {
    console.warn(`Native health latest sample skipped for ${dataType}:`, error)
    return null
  }
}

async function readLatestBloodPressure(Health: NativeHealthModule, start: Date, end: Date) {
  try {
    if (!Health.readSamples) return null
    const result = await Health.readSamples({
      dataType: 'bloodPressure',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      limit: 50,
    })
    const sample = latestSample(result?.samples || [])
    return sample?.systolic || sample?.diastolic ? { systolic: sample.systolic, diastolic: sample.diastolic } : null
  } catch (error) {
    console.warn('Native health blood pressure skipped:', error)
    return null
  }
}

function reduceSamples(samples: HealthSample[], mode: 'sum' | 'average') {
  const values = samples
    .map((item) => Number(item.value))
    .filter((value) => Number.isFinite(value) && value > 0)

  if (!values.length) return null
  if (mode === 'sum') return values.reduce((sum, value) => sum + value, 0)
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function latestSample(samples: HealthSample[]) {
  return [...samples].sort((a, b) => String(b.endDate || b.startDate || '').localeCompare(String(a.endDate || a.startDate || '')))[0]
}

function startOfLocalDay(offsetDaysFromToday: number) {
  const date = new Date()
  date.setDate(date.getDate() - offsetDaysFromToday)
  date.setHours(0, 0, 0, 0)
  return date
}

function endOfLocalDay(start: Date) {
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return end
}

function toIsoDate(date: Date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 10) / 10 : null
}

function normalizeInteger(value: unknown) {
  const parsed = normalizeNumber(value)
  return parsed == null ? null : Math.round(parsed)
}

function normalizeSleepMinutes(value: unknown) {
  const parsed = normalizeNumber(value)
  if (parsed == null) return null
  if (parsed <= 24) return Math.round(parsed * 60)
  if (parsed > 24 * 60) return Math.round(parsed / 60)
  return Math.round(parsed)
}

function normalizeSpo2(value: unknown) {
  const parsed = normalizeNumber(value)
  if (parsed == null) return null
  return parsed <= 1 ? Math.round(parsed * 1000) / 10 : Math.round(parsed * 10) / 10
}

function hasAnyMetric(summary: DeviceDailySummaryInput) {
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
    summary.temperature_c,
    summary.active_calories,
    summary.activity_minutes,
  ].some((value) => normalizeNumber(value) !== null)
}
