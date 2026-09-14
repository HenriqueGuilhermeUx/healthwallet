export type ClinicalDeviceSummary = {
  summary_date?: string
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
  device_context_score?: number | null
  device_confidence?: number | null
  last_sync_at?: string | null
  sources?: string[]
}

export type ClinicalDeviceInsights = {
  hasData: boolean
  coverageDays: number
  confidence: number
  latestDate: string | null
  latestSyncAt: string | null
  sources: string[]
  recent: Record<string, number | null>
  baseline: Record<string, number | null>
  trends: string[]
  attention: string[]
  positives: string[]
  clinicianBullets: string[]
  disclaimer: string
}

export function buildClinicalDeviceInsights(items: ClinicalDeviceSummary[] = []): ClinicalDeviceInsights {
  const sorted = [...items]
    .filter(Boolean)
    .filter((item) => Boolean(item.summary_date))
    .sort((a, b) => String(b.summary_date).localeCompare(String(a.summary_date)))
    .slice(0, 30)

  if (!sorted.length) {
    return {
      hasData: false,
      coverageDays: 0,
      confidence: 0,
      latestDate: null,
      latestSyncAt: null,
      sources: [],
      recent: {},
      baseline: {},
      trends: [],
      attention: [],
      positives: [],
      clinicianBullets: ['Sem dados recentes de dispositivos conectados.'],
      disclaimer: 'Dados de dispositivos pessoais são complementares e não substituem avaliação clínica, exame físico ou diagnóstico profissional.',
    }
  }

  const recent = sorted.slice(0, 7)
  const baselineWindow = sorted.slice(7, 30)
  const latest = sorted[0]
  const sources = Array.from(new Set(sorted.flatMap((item) => Array.isArray(item.sources) ? item.sources : [])))
  const coverageDays = sorted.length

  const recentMetrics = {
    steps: average(recent.map((item) => item.steps)),
    sleepMinutes: average(recent.map((item) => item.sleep_minutes)),
    restingHeartRate: average(recent.map((item) => item.resting_heart_rate)),
    avgHeartRate: average(recent.map((item) => item.avg_heart_rate)),
    hrv: average(recent.map((item) => item.hrv_avg)),
    spo2: average(recent.map((item) => item.spo2_avg)),
    systolic: average(recent.map((item) => item.systolic_bp)),
    diastolic: average(recent.map((item) => item.diastolic_bp)),
    weightKg: average(recent.map((item) => item.weight_kg)),
    activeCalories: average(recent.map((item) => item.active_calories)),
    activityMinutes: average(recent.map((item) => item.activity_minutes)),
  }

  const baselineMetrics = {
    steps: average(baselineWindow.map((item) => item.steps)),
    sleepMinutes: average(baselineWindow.map((item) => item.sleep_minutes)),
    restingHeartRate: average(baselineWindow.map((item) => item.resting_heart_rate)),
    avgHeartRate: average(baselineWindow.map((item) => item.avg_heart_rate)),
    hrv: average(baselineWindow.map((item) => item.hrv_avg)),
    spo2: average(baselineWindow.map((item) => item.spo2_avg)),
    systolic: average(baselineWindow.map((item) => item.systolic_bp)),
    diastolic: average(baselineWindow.map((item) => item.diastolic_bp)),
    weightKg: average(baselineWindow.map((item) => item.weight_kg)),
    activeCalories: average(baselineWindow.map((item) => item.active_calories)),
    activityMinutes: average(baselineWindow.map((item) => item.activity_minutes)),
  }

  const trends: string[] = []
  const attention: string[] = []
  const positives: string[] = []

  addRelativeTrend(trends, 'Passos', recentMetrics.steps, baselineMetrics.steps, 0.20, 'aumentaram', 'diminuíram')
  addAbsoluteTrend(trends, 'Sono médio', recentMetrics.sleepMinutes, baselineMetrics.sleepMinutes, 45, 'aumentou', 'diminuiu', 'min/noite')
  addAbsoluteTrend(trends, 'FC de repouso', recentMetrics.restingHeartRate, baselineMetrics.restingHeartRate, 8, 'subiu', 'caiu', 'bpm')
  addRelativeTrend(trends, 'HRV', recentMetrics.hrv, baselineMetrics.hrv, 0.25, 'aumentou', 'diminuiu')

  if (recentMetrics.steps != null) {
    if (recentMetrics.steps >= 7000) positives.push(`Atividade: média de ${Math.round(recentMetrics.steps)} passos/dia nos últimos 7 dias.`)
    else if (recentMetrics.steps < 2500) attention.push(`Atividade baixa: média de ${Math.round(recentMetrics.steps)} passos/dia nos últimos 7 dias.`)
  }

  if (recentMetrics.sleepMinutes != null) {
    const hours = recentMetrics.sleepMinutes / 60
    if (hours >= 7 && hours <= 9) positives.push(`Sono: média de ${hours.toFixed(1)} h/noite nos últimos 7 dias.`)
    else if (hours < 5 || hours > 11) attention.push(`Sono registrado fora da faixa habitual: média de ${hours.toFixed(1)} h/noite.`)
  }

  if (recentMetrics.restingHeartRate != null && (recentMetrics.restingHeartRate > 95 || recentMetrics.restingHeartRate < 40)) {
    attention.push(`FC de repouso média de ${Math.round(recentMetrics.restingHeartRate)} bpm; correlacionar com sintomas, contexto e qualidade da medição.`)
  }

  const lowSpo2Days = recent.filter((item) => number(item.spo2_avg) != null && number(item.spo2_avg)! < 92).length
  if (recentMetrics.spo2 != null) {
    if (recentMetrics.spo2 >= 95) positives.push(`SpO₂ média registrada: ${recentMetrics.spo2.toFixed(1)}%.`)
    if (lowSpo2Days >= 2) attention.push(`SpO₂ abaixo de 92% registrada em ${lowSpo2Days} dias recentes; confirmar qualidade do sensor e interpretar clinicamente.`)
  }

  const highBpDays = recent.filter((item) => {
    const sys = number(item.systolic_bp)
    const dia = number(item.diastolic_bp)
    return (sys != null && sys >= 140) || (dia != null && dia >= 90)
  }).length
  if (highBpDays >= 2) {
    attention.push(`Pressão ≥140/90 mmHg registrada em ${highBpDays} dias recentes; revisar técnica, contexto e necessidade de avaliação profissional.`)
  }

  if (
    recentMetrics.restingHeartRate != null &&
    baselineMetrics.restingHeartRate != null &&
    recentMetrics.restingHeartRate - baselineMetrics.restingHeartRate >= 10
  ) {
    attention.push(`FC de repouso subiu cerca de ${Math.round(recentMetrics.restingHeartRate - baselineMetrics.restingHeartRate)} bpm versus o baseline recente.`)
  }

  if (
    recentMetrics.sleepMinutes != null &&
    baselineMetrics.sleepMinutes != null &&
    baselineMetrics.sleepMinutes - recentMetrics.sleepMinutes >= 60
  ) {
    attention.push('Sono médio caiu pelo menos 1 hora/noite em relação ao baseline recente.')
  }

  const dataConfidence = average(sorted.map((item) => item.device_confidence))
  const metricCoverage = countPresentMetrics(recentMetrics)
  const confidence = clamp(
    dataConfidence != null
      ? (dataConfidence * 0.65) + (Math.min(7, recent.length) / 7 * 25) + Math.min(10, metricCoverage * 1.5)
      : (Math.min(7, recent.length) / 7 * 65) + Math.min(35, metricCoverage * 4),
  )

  const clinicianBullets = [
    `Cobertura: ${coverageDays} dia(s) nos últimos 30; confiança contextual ${confidence}%.`,
    ...attention.map((item) => `Atenção: ${item}`),
    ...trends.map((item) => `Tendência: ${item}`),
    ...positives.map((item) => `Contexto favorável: ${item}`),
  ]

  if (clinicianBullets.length === 1) clinicianBullets.push('Sem tendência relevante identificada com a cobertura disponível.')

  return {
    hasData: true,
    coverageDays,
    confidence,
    latestDate: latest.summary_date || null,
    latestSyncAt: latest.last_sync_at || null,
    sources,
    recent: recentMetrics,
    baseline: baselineMetrics,
    trends,
    attention,
    positives,
    clinicianBullets,
    disclaimer: 'Dados de smartwatch, celular ou outros dispositivos são contexto complementar. Podem conter erro de medição e não devem ser usados isoladamente para diagnóstico ou decisão terapêutica.',
  }
}

export function formatClinicalDeviceSummary(insights: ClinicalDeviceInsights) {
  if (!insights.hasData) return 'Sem dados recentes de dispositivos conectados.'

  const lines = [
    `Cobertura: ${insights.coverageDays} dia(s) nos últimos 30`,
    `Confiança contextual: ${insights.confidence}%`,
    `Fontes: ${insights.sources.length ? insights.sources.join(', ') : 'não informadas'}`,
    '',
    ...insights.clinicianBullets.slice(1).map((line) => `- ${line}`),
    '',
    insights.disclaimer,
  ]

  return lines.join('\n')
}

function addRelativeTrend(
  output: string[],
  label: string,
  recent: number | null,
  baseline: number | null,
  threshold: number,
  upLabel: string,
  downLabel: string,
) {
  if (recent == null || baseline == null || baseline <= 0) return
  const delta = (recent - baseline) / baseline
  if (Math.abs(delta) < threshold) return
  output.push(`${label} ${delta > 0 ? upLabel : downLabel} ${Math.round(Math.abs(delta) * 100)}% versus o baseline recente.`)
}

function addAbsoluteTrend(
  output: string[],
  label: string,
  recent: number | null,
  baseline: number | null,
  threshold: number,
  upLabel: string,
  downLabel: string,
  unit: string,
) {
  if (recent == null || baseline == null) return
  const delta = recent - baseline
  if (Math.abs(delta) < threshold) return
  output.push(`${label} ${delta > 0 ? upLabel : downLabel} ${Math.round(Math.abs(delta))} ${unit} versus o baseline recente.`)
}

function countPresentMetrics(metrics: Record<string, number | null>) {
  return Object.values(metrics).filter((value) => value != null).length
}

function average(values: Array<number | string | null | undefined>) {
  const parsed = values.map(number).filter((value): value is number => value != null && value > 0)
  if (!parsed.length) return null
  return parsed.reduce((sum, value) => sum + value, 0) / parsed.length
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}
