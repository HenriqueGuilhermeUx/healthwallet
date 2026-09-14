import { Capacitor, registerPlugin } from '@capacitor/core'
import { supabase } from '../lib/supabase'
import { HealthMetric } from './healthSync'

type DirectHealthDailyRow = {
  date: string
  steps?: number
  sleepMinutes?: number
  avgHeartRate?: number
  restingHeartRate?: number
  spo2Avg?: number
  hrvAvg?: number
  systolicBp?: number
  diastolicBp?: number
  weightKg?: number
  activeCalories?: number
  activityMinutes?: number
}

type DirectHealthDailyResult = {
  reader: 'android_platform_health_connect'
  daysRequested: number
  days: DirectHealthDailyRow[]
  metricsRead: HealthMetric[]
  metricErrors?: Record<string, string>
}

type DirectPermissionResult = {
  permission: string
  granted: boolean
  packageName: string
}

type DirectHealthPermissionsResult = {
  packageName: string
  grantedPermissions: string[]
  missingPermissions: string[]
  allGranted: boolean
  requestedPermissionCount: number
}

type DirectPermissionRequestResult = {
  launched: boolean
  packageName: string
  requestedPermissionCount: number
  strategy: 'activity_result_launcher_proxy' | 'platform_permission_controller_contract'
}

type DirectPermissionOpenResult = {
  opened: boolean
  permission: string
  packageName: string
  strategy?: 'manage_health_permissions_fallback'
}

type DirectHealthReaderPlugin = {
  checkHealthPermissions(): Promise<DirectHealthPermissionsResult>
  requestHealthPermissions(): Promise<DirectPermissionRequestResult>
  checkStepsPermission(): Promise<DirectPermissionResult>
  requestStepsPermission(): Promise<DirectPermissionRequestResult>
  openStepsPermissionSettings(): Promise<DirectPermissionOpenResult>
  readStepsDaily(options: { days: number }): Promise<DirectHealthDailyResult>
  readHealthDaily(options: { days: number; metrics: HealthMetric[] }): Promise<DirectHealthDailyResult>
}

const DirectHealthReader = registerPlugin<DirectHealthReaderPlugin>('DirectHealthReader')

export const ANDROID_PERMISSION_BY_METRIC: Record<HealthMetric, string> = {
  steps: 'android.permission.health.READ_STEPS',
  sleep: 'android.permission.health.READ_SLEEP',
  heartRate: 'android.permission.health.READ_HEART_RATE',
  restingHeartRate: 'android.permission.health.READ_RESTING_HEART_RATE',
  oxygenSaturation: 'android.permission.health.READ_OXYGEN_SATURATION',
  heartRateVariability: 'android.permission.health.READ_HEART_RATE_VARIABILITY',
  bloodPressure: 'android.permission.health.READ_BLOOD_PRESSURE',
  weight: 'android.permission.health.READ_WEIGHT',
  calories: 'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  exerciseTime: 'android.permission.health.READ_EXERCISE',
}

const SUMMARY_FIELDS: Array<keyof Omit<DirectHealthDailyRow, 'date'>> = [
  'steps',
  'sleepMinutes',
  'avgHeartRate',
  'restingHeartRate',
  'spo2Avg',
  'hrvAvg',
  'systolicBp',
  'diastolicBp',
  'weightKg',
  'activeCalories',
  'activityMinutes',
]

function withTimeout<T>(promise: Promise<T>, ms = 30000): Promise<T> {
  let timer: number | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(`Leitor Android oficial não respondeu em ${Math.round(ms / 1000)} segundos.`)), ms)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) window.clearTimeout(timer)
  })
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function hasNativeData(row: DirectHealthDailyRow) {
  return SUMMARY_FIELDS.some((field) => numberOrNull(row[field]) !== null)
}

function nativeDataPointCount(row: DirectHealthDailyRow) {
  return SUMMARY_FIELDS.filter((field) => numberOrNull(row[field]) !== null).length
}

export function isDirectAndroidHealthAvailable() {
  return Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform()
}

export async function checkDirectAndroidHealthPermissions(metrics: HealthMetric[]) {
  if (!isDirectAndroidHealthAvailable()) {
    return {
      packageName: '',
      grantedPermissions: [] as string[],
      missingPermissions: metrics.map((metric) => ANDROID_PERMISSION_BY_METRIC[metric]),
      allGranted: false,
      requestedPermissionCount: metrics.length,
      grantedMetrics: [] as HealthMetric[],
      missingMetrics: [...metrics],
    }
  }

  const result = await withTimeout(DirectHealthReader.checkHealthPermissions(), 5000)
  const granted = new Set(result.grantedPermissions || [])
  const uniqueMetrics = Array.from(new Set(metrics))
  const grantedMetrics = uniqueMetrics.filter((metric) => granted.has(ANDROID_PERMISSION_BY_METRIC[metric]))
  const missingMetrics = uniqueMetrics.filter((metric) => !granted.has(ANDROID_PERMISSION_BY_METRIC[metric]))

  return {
    ...result,
    grantedMetrics,
    missingMetrics,
    allSelectedGranted: missingMetrics.length === 0,
  }
}

export async function requestDirectAndroidHealthPermissions() {
  if (!isDirectAndroidHealthAvailable()) {
    throw new Error('Pedido de permissão disponível somente no app Android instalado.')
  }
  return withTimeout(DirectHealthReader.requestHealthPermissions(), 5000)
}

export async function checkDirectAndroidStepsPermission() {
  if (!isDirectAndroidHealthAvailable()) {
    return { granted: false, permission: 'android.permission.health.READ_STEPS', packageName: '' }
  }
  return withTimeout(DirectHealthReader.checkStepsPermission(), 5000)
}

export async function requestDirectAndroidStepsPermission() {
  return requestDirectAndroidHealthPermissions()
}

export async function openDirectAndroidStepsPermission() {
  if (!isDirectAndroidHealthAvailable()) {
    throw new Error('Permissão direta disponível somente no app Android instalado.')
  }
  return withTimeout(DirectHealthReader.openStepsPermissionSettings(), 5000)
}

/**
 * Native Android sync. No @capgo/capacitor-health read is allowed in this path.
 * The reader uses HealthConnectManager directly and returns one normalized row
 * per local calendar day for all granted HealthWallet metrics.
 */
export async function syncDirectAndroidHealth(userId: string, metrics: HealthMetric[], days = 30) {
  if (!userId) throw new Error('Usuário não autenticado.')
  if (!isDirectAndroidHealthAvailable()) throw new Error('Leitor Android direto disponível somente no Android.')

  const requestedMetrics = Array.from(new Set(metrics))
  const permission = await checkDirectAndroidHealthPermissions(requestedMetrics)
  const grantedMetrics = permission.grantedMetrics

  if (!grantedMetrics.length) throw new Error('NO_HEALTH_PERMISSIONS_GRANTED')

  const safeDays = Math.max(1, Math.min(30, days))
  const direct = await withTimeout(
    DirectHealthReader.readHealthDaily({ days: safeDays, metrics: grantedMetrics }),
    45000,
  )

  const rows = (Array.isArray(direct.days) ? direct.days : [])
    .filter((row) => row?.date && hasNativeData(row))
    .sort((a, b) => a.date.localeCompare(b.date))

  const metricsRead = Array.from(new Set(direct.metricsRead || [])) as HealthMetric[]
  const metricErrors = direct.metricErrors || {}

  if (!rows.length && Object.keys(metricErrors).length) {
    const first = Object.entries(metricErrors)[0]
    throw new Error(`Health Connect não conseguiu ler ${first[0]}: ${first[1]}`)
  }

  if (!rows.length) {
    return {
      provider: 'health_connect' as const,
      reader: direct.reader,
      daysRequested: safeDays,
      daysSynced: 0,
      requestedMetrics,
      grantedMetrics,
      skippedMetrics: permission.missingMetrics,
      permissionStrategy: 'activity_result_launcher_proxy' as const,
      degraded: metricsRead.length < grantedMetrics.length,
      nativeReadMetrics: metricsRead,
      pendingNativeReadMetrics: grantedMetrics.filter((metric) => !metricsRead.includes(metric)),
      metricErrors,
      latest: null,
    }
  }

  const firstDate = rows[0].date
  const lastDate = rows[rows.length - 1].date
  const { data: existingRows, error: existingError } = await supabase
    .from('health_daily_summaries')
    .select('*')
    .eq('user_id', userId)
    .gte('summary_date', firstDate)
    .lte('summary_date', lastDate)

  if (existingError) throw existingError

  const existingByDate = new Map((existingRows || []).map((row: any) => [row.summary_date, row]))
  const now = new Date().toISOString()

  const payloads = rows.map((row) => {
    const existing: any = existingByDate.get(row.date)
    const sources = Array.from(new Set([...(Array.isArray(existing?.sources) ? existing.sources : []), 'health_connect']))
    const merged = {
      steps: numberOrNull(row.steps) ?? numberOrNull(existing?.steps),
      sleep_minutes: numberOrNull(row.sleepMinutes) ?? numberOrNull(existing?.sleep_minutes),
      avg_heart_rate: numberOrNull(row.avgHeartRate) ?? numberOrNull(existing?.avg_heart_rate),
      resting_heart_rate: numberOrNull(row.restingHeartRate) ?? numberOrNull(existing?.resting_heart_rate),
      spo2_avg: numberOrNull(row.spo2Avg) ?? numberOrNull(existing?.spo2_avg),
      hrv_avg: numberOrNull(row.hrvAvg) ?? numberOrNull(existing?.hrv_avg),
      systolic_bp: numberOrNull(row.systolicBp) ?? numberOrNull(existing?.systolic_bp),
      diastolic_bp: numberOrNull(row.diastolicBp) ?? numberOrNull(existing?.diastolic_bp),
      weight_kg: numberOrNull(row.weightKg) ?? numberOrNull(existing?.weight_kg),
      active_calories: numberOrNull(row.activeCalories) ?? numberOrNull(existing?.active_calories),
      activity_minutes: numberOrNull(row.activityMinutes) ?? numberOrNull(existing?.activity_minutes),
    }
    const dataPoints = Object.values(merged).filter((value) => value !== null).length

    return {
      user_id: userId,
      summary_date: row.date,
      ...merged,
      sources,
      data_points: Math.max(dataPoints, Number(existing?.data_points) || 0, nativeDataPointCount(row)),
      metadata: {
        ...(existing?.metadata || {}),
        source_app: 'healthwallet_connect',
        provider: 'health_connect',
        patient_controlled: true,
        selected_metrics: grantedMetrics,
        sync_version: 8,
        read_strategy: 'android_platform_health_connect_full_native',
        direct_reader: true,
        direct_permission_check: true,
        permission_strategy: 'activity_result_launcher_proxy',
        native_read_metrics: metricsRead,
        pending_native_read_metrics: grantedMetrics.filter((metric) => !metricsRead.includes(metric)),
        metric_errors: metricErrors,
      },
      last_sync_at: now,
      updated_at: now,
    }
  })

  const { error: upsertError } = await supabase
    .from('health_daily_summaries')
    .upsert(payloads, { onConflict: 'user_id,summary_date' })

  if (upsertError) throw upsertError

  const { data: existingConnection } = await supabase
    .from('health_device_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'health_connect')
    .neq('status', 'revoked')
    .maybeSingle()

  const connectionPayload = {
    user_id: userId,
    provider: 'health_connect',
    display_name: 'Health Connect',
    source_device: 'Android Health Connect',
    status: 'connected',
    scopes_authorized: grantedMetrics,
    last_sync_at: now,
    metadata: {
      source_app: 'healthwallet_connect',
      patient_controlled: true,
      direct_reader: 'android_platform_health_connect',
      sync_version: 8,
      direct_permission_check: true,
      permission_strategy: 'activity_result_launcher_proxy',
      native_read_metrics: metricsRead,
      pending_native_read_metrics: grantedMetrics.filter((metric) => !metricsRead.includes(metric)),
      metric_errors: metricErrors,
    },
  }

  if (existingConnection?.id) {
    const { error } = await supabase
      .from('health_device_connections')
      .update(connectionPayload)
      .eq('id', existingConnection.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('health_device_connections').insert(connectionPayload)
    if (error) throw error
  }

  return {
    provider: 'health_connect' as const,
    reader: direct.reader,
    daysRequested: safeDays,
    daysSynced: rows.length,
    requestedMetrics,
    grantedMetrics,
    skippedMetrics: permission.missingMetrics,
    permissionStrategy: 'activity_result_launcher_proxy' as const,
    degraded: metricsRead.length < grantedMetrics.length || Object.keys(metricErrors).length > 0,
    nativeReadMetrics: metricsRead,
    pendingNativeReadMetrics: grantedMetrics.filter((metric) => !metricsRead.includes(metric)),
    metricErrors,
    latest: rows[rows.length - 1],
  }
}

// Compatibility helper retained for the diagnostic screen and old test builds.
export async function syncDirectAndroidSteps(userId: string, days = 7, authorizedMetrics: HealthMetric[] = ['steps']) {
  return syncDirectAndroidHealth(userId, Array.from(new Set(['steps', ...authorizedMetrics])) as HealthMetric[], days)
}
