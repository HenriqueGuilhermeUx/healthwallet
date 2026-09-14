import { Capacitor, registerPlugin } from '@capacitor/core'
import { supabase } from '../lib/supabase'
import { HealthMetric, syncHealthData } from './healthSync'

type DirectStepsRow = {
  date: string
  steps: number
}

type DirectStepsResult = {
  reader: 'android_platform_health_connect'
  daysRequested: number
  days: DirectStepsRow[]
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
  strategy: 'platform_permission_controller_contract'
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
  readStepsDaily(options: { days: number }): Promise<DirectStepsResult>
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

function withTimeout<T>(promise: Promise<T>, ms = 20000): Promise<T> {
  let timer: number | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(`Leitor Android oficial não respondeu em ${Math.round(ms / 1000)} segundos.`)), ms)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) window.clearTimeout(timer)
  })
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

export async function syncDirectAndroidHealth(userId: string, metrics: HealthMetric[], days = 30) {
  if (!userId) throw new Error('Usuário não autenticado.')
  if (!isDirectAndroidHealthAvailable()) throw new Error('Leitor Android direto disponível somente no Android.')

  const requestedMetrics = Array.from(new Set(metrics))
  const permission = await checkDirectAndroidHealthPermissions(requestedMetrics)
  const grantedMetrics = permission.grantedMetrics

  if (!grantedMetrics.length) {
    throw new Error('NO_HEALTH_PERMISSIONS_GRANTED')
  }

  try {
    const result = await syncHealthData(userId, grantedMetrics, days, { skipAuthorization: true })
    return {
      ...result,
      requestedMetrics,
      grantedMetrics,
      skippedMetrics: permission.missingMetrics,
      permissionStrategy: 'platform_permission_controller_contract' as const,
      degraded: false,
    }
  } catch (error) {
    // Steps already work through the Android platform API on the tested device.
    // Preserve that reliable path as a graceful fallback while the broader
    // @capgo reader handles the remaining authorized metrics.
    if (!grantedMetrics.includes('steps')) throw error

    const fallback = await syncDirectAndroidSteps(userId, days)
    return {
      ...fallback,
      requestedMetrics,
      grantedMetrics: ['steps'] as HealthMetric[],
      skippedMetrics: requestedMetrics.filter((metric) => metric !== 'steps'),
      permissionStrategy: 'platform_permission_controller_contract' as const,
      degraded: true,
      fallbackReason: error instanceof Error ? error.message : 'full_sync_failed',
    }
  }
}

export async function syncDirectAndroidSteps(userId: string, days = 7) {
  if (!userId) throw new Error('Usuário não autenticado.')
  if (!isDirectAndroidHealthAvailable()) throw new Error('Leitor Android direto disponível somente no Android.')

  const permission = await checkDirectAndroidStepsPermission()
  if (!permission.granted) {
    throw new Error('READ_STEPS_NOT_GRANTED')
  }

  const safeDays = Math.max(1, Math.min(7, days))
  const direct = await withTimeout(DirectHealthReader.readStepsDaily({ days: safeDays }), 20000)

  if (!Array.isArray(direct.days) || direct.days.length === 0) {
    throw new Error('O Android respondeu, mas não retornou nenhum dia de passos.')
  }

  const ordered = [...direct.days].sort((a, b) => a.date.localeCompare(b.date))
  const firstDate = ordered[0].date
  const lastDate = ordered[ordered.length - 1].date

  const { data: existingRows, error: existingError } = await supabase
    .from('health_daily_summaries')
    .select('*')
    .eq('user_id', userId)
    .gte('summary_date', firstDate)
    .lte('summary_date', lastDate)

  if (existingError) throw existingError

  const existingByDate = new Map((existingRows || []).map((row: any) => [row.summary_date, row]))
  const now = new Date().toISOString()

  const payloads = ordered.map((row) => {
    const existing: any = existingByDate.get(row.date)
    const sources = Array.from(new Set([...(Array.isArray(existing?.sources) ? existing.sources : []), 'health_connect']))
    const metadata = {
      ...(existing?.metadata || {}),
      source_app: 'healthwallet_connect',
      provider: 'health_connect',
      patient_controlled: true,
      selected_metrics: ['steps'],
      sync_version: 6,
      read_strategy: 'android_platform_health_connect_direct',
      direct_reader: true,
      direct_permission_check: true,
      permission_strategy: 'platform_permission_controller_contract_with_settings_fallback',
    }

    return {
      user_id: userId,
      summary_date: row.date,
      steps: Math.max(0, Math.round(Number(row.steps) || 0)),
      sources,
      data_points: Math.max(1, Number(existing?.data_points) || 0),
      metadata,
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
    scopes_authorized: ['steps'],
    last_sync_at: now,
    metadata: {
      source_app: 'healthwallet_connect',
      patient_controlled: true,
      direct_reader: 'android_platform_health_connect',
      sync_version: 6,
      direct_permission_check: true,
      permission_strategy: 'platform_permission_controller_contract_with_settings_fallback',
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
    daysSynced: ordered.length,
    metrics: ['steps'] as const,
    latest: ordered[ordered.length - 1],
  }
}
