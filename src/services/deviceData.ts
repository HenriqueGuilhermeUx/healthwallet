import { supabase } from '@/lib/supabase'

export type DeviceProvider =
  | 'apple_health'
  | 'health_connect'
  | 'fitbit'
  | 'garmin'
  | 'oura'
  | 'withings'
  | 'polar'
  | 'samsung_health'
  | 'manual'
  | 'other'

export type DeviceDailySummaryInput = {
  user_id: string
  summary_date: string
  sources?: string[]
  data_points?: number
  steps?: number | null
  sleep_minutes?: number | null
  resting_heart_rate?: number | null
  avg_heart_rate?: number | null
  hrv_avg?: number | null
  spo2_avg?: number | null
  systolic_bp?: number | null
  diastolic_bp?: number | null
  weight_kg?: number | null
  temperature_c?: number | null
  active_calories?: number | null
  activity_minutes?: number | null
  metadata?: Record<string, unknown>
}

export type DeviceDailySummary = DeviceDailySummaryInput & {
  id?: string
  device_context_score?: number | null
  device_confidence?: number | null
  score_factors?: any
  last_sync_at?: string | null
  created_at?: string
  updated_at?: string
}

const readableProviders: Record<DeviceProvider, string> = {
  apple_health: 'Apple Saúde / Apple Watch',
  health_connect: 'Android Health Connect',
  fitbit: 'Fitbit',
  garmin: 'Garmin',
  oura: 'Oura Ring',
  withings: 'Withings',
  polar: 'Polar',
  samsung_health: 'Samsung Health',
  manual: 'Registro manual',
  other: 'Outro dispositivo',
}

export function getProviderLabel(provider: DeviceProvider) {
  return readableProviders[provider] || readableProviders.other
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function getLatestSummary(summaries: DeviceDailySummary[] = []) {
  return [...summaries].sort((a, b) => String(b.summary_date).localeCompare(String(a.summary_date)))[0] || null
}

export function average(values: Array<number | null | undefined>) {
  const valid = values.map(Number).filter((value) => Number.isFinite(value) && value > 0)
  if (!valid.length) return null
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length)
}

export function summarizeDeviceWindow(summaries: DeviceDailySummary[] = []) {
  const latest = getLatestSummary(summaries)
  const last7 = [...summaries]
    .sort((a, b) => String(b.summary_date).localeCompare(String(a.summary_date)))
    .slice(0, 7)

  return {
    latest,
    days: last7.length,
    avgSteps: average(last7.map((item) => item.steps)),
    avgSleepMinutes: average(last7.map((item) => item.sleep_minutes)),
    avgRestingHeartRate: average(last7.map((item) => item.resting_heart_rate)),
    avgSpo2: average(last7.map((item) => item.spo2_avg)),
    avgDeviceScore: average(last7.map((item) => item.device_context_score)),
  }
}

export function calculateLocalDeviceContext(summary: Partial<DeviceDailySummaryInput>) {
  let score = 50
  let confidence = 0
  const factors: string[] = []
  const attention: string[] = []

  if (summary.steps != null) {
    confidence += 15
    if (summary.steps >= 7000) {
      score += 10
      factors.push('Bom volume de passos registrado')
    } else if (summary.steps >= 4000) {
      score += 4
      factors.push('Atividade registrada')
    } else if (summary.steps < 2500) {
      score -= 8
      attention.push('Baixo volume de passos registrado')
    }
  }

  if (summary.sleep_minutes != null) {
    confidence += 20
    if (summary.sleep_minutes >= 420 && summary.sleep_minutes <= 540) {
      score += 10
      factors.push('Sono registrado em faixa consistente')
    } else if (summary.sleep_minutes >= 360 && summary.sleep_minutes <= 600) {
      score += 4
      factors.push('Sono registrado')
    } else {
      score -= 8
      attention.push('Sono fora da faixa habitual registrada')
    }
  }

  if (summary.resting_heart_rate != null) {
    confidence += 15
    if (summary.resting_heart_rate >= 45 && summary.resting_heart_rate <= 80) {
      score += 6
      factors.push('Frequência cardíaca de repouso registrada em faixa usual')
    } else if (summary.resting_heart_rate > 95 || summary.resting_heart_rate < 40) {
      score -= 8
      attention.push('Frequência cardíaca de repouso merece revisão de contexto')
    }
  }

  if (summary.spo2_avg != null) {
    confidence += 10
    if (summary.spo2_avg >= 95) score += 5
    else if (summary.spo2_avg < 92) {
      score -= 8
      attention.push('SpO2 registrada abaixo do habitual, requer interpretação profissional')
    }
  }

  if (summary.systolic_bp != null || summary.diastolic_bp != null) {
    confidence += 15
    if ((summary.systolic_bp || 0) >= 140 || (summary.diastolic_bp || 0) >= 90) {
      score -= 8
      attention.push('Pressão arterial registrada merece revisão profissional')
    } else {
      score += 3
      factors.push('Pressão arterial registrada')
    }
  }

  if (summary.weight_kg != null) {
    confidence += 5
    factors.push('Peso registrado')
  }

  if ((summary.data_points || 0) >= 5) {
    confidence += 10
    score += 4
  }

  return {
    score: clamp(score),
    confidence: clamp(confidence),
    factors,
    attention,
    disclaimer: 'Dados de dispositivos pessoais são complementares e não substituem avaliação profissional.',
  }
}

export async function loadDeviceData(userId: string) {
  const [connectionsRes, summariesRes, consentsRes] = await Promise.all([
    supabase
      .from('health_device_connections')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('health_daily_summaries')
      .select('*')
      .eq('user_id', userId)
      .order('summary_date', { ascending: false })
      .limit(30),
    supabase
      .from('health_data_consents')
      .select('*')
      .eq('patient_id', userId)
      .order('created_at', { ascending: false }),
  ])

  return {
    connections: connectionsRes.data || [],
    summaries: (summariesRes.data || []) as DeviceDailySummary[],
    consents: consentsRes.data || [],
    error: connectionsRes.error || summariesRes.error || consentsRes.error || null,
  }
}

export async function connectDeviceProvider(userId: string, provider: DeviceProvider) {
  const existing = await supabase
    .from('health_device_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .neq('status', 'revoked')
    .maybeSingle()

  const payload = {
    user_id: userId,
    provider,
    display_name: getProviderLabel(provider),
    source_device: getProviderLabel(provider),
    status: provider === 'manual' ? 'connected' : 'pending_setup',
    scopes_authorized: ['steps', 'sleep', 'heart_rate', 'weight', 'blood_pressure', 'spo2'],
    last_sync_at: provider === 'manual' ? new Date().toISOString() : null,
    metadata: {
      mvp_status: provider === 'manual' ? 'manual_entry_enabled' : 'native_connector_pending',
      patient_controlled: true,
      consent_required_for_sharing: true,
    },
  }

  if (existing.data?.id) {
    return supabase.from('health_device_connections').update(payload).eq('id', existing.data.id).select('*').single()
  }

  return supabase.from('health_device_connections').insert(payload).select('*').single()
}

export async function upsertDeviceDailySummary(input: DeviceDailySummaryInput) {
  const dataPoints = countDataPoints(input)
  const localScore = calculateLocalDeviceContext({ ...input, data_points: dataPoints })

  const payload = {
    user_id: input.user_id,
    summary_date: input.summary_date,
    sources: input.sources?.length ? input.sources : ['manual'],
    data_points: dataPoints,
    steps: nullableNumber(input.steps),
    sleep_minutes: nullableNumber(input.sleep_minutes),
    resting_heart_rate: nullableNumber(input.resting_heart_rate),
    avg_heart_rate: nullableNumber(input.avg_heart_rate),
    hrv_avg: nullableNumber(input.hrv_avg),
    spo2_avg: nullableNumber(input.spo2_avg),
    systolic_bp: nullableNumber(input.systolic_bp),
    diastolic_bp: nullableNumber(input.diastolic_bp),
    weight_kg: nullableNumber(input.weight_kg),
    temperature_c: nullableNumber(input.temperature_c),
    active_calories: nullableNumber(input.active_calories),
    activity_minutes: nullableNumber(input.activity_minutes),
    device_context_score: localScore.score,
    device_confidence: localScore.confidence,
    score_factors: localScore,
    metadata: {
      ...(input.metadata || {}),
      source_app: 'healthwallet_mobile',
      local_score_preview: localScore,
    },
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  return supabase
    .from('health_daily_summaries')
    .upsert(payload, { onConflict: 'user_id,summary_date' })
    .select('*')
    .single()
}

export async function shareDeviceDataWithProfessional(userId: string, careLink: any) {
  const payload = {
    patient_id: userId,
    professional_id: careLink.professional_id || null,
    clinic_id: careLink.clinic_id || null,
    care_link_id: careLink.id,
    allowed_categories: ['device_data', 'daily_summaries', 'medscore_context'],
    status: 'active',
    purpose: 'care_context',
    expires_at: careLink.expires_at || null,
    metadata: {
      source_app: 'healthwallet_mobile',
      professional_name: careLink.professional_name || null,
      professional_email: careLink.professional_email || null,
      patient_controlled: true,
    },
  }

  return supabase.from('health_data_consents').insert(payload).select('*').single()
}

function countDataPoints(input: DeviceDailySummaryInput) {
  return [
    input.steps,
    input.sleep_minutes,
    input.resting_heart_rate,
    input.avg_heart_rate,
    input.hrv_avg,
    input.spo2_avg,
    input.systolic_bp,
    input.diastolic_bp,
    input.weight_kg,
    input.temperature_c,
    input.active_calories,
    input.activity_minutes,
  ].filter((value) => nullableNumber(value) !== null).length
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}
