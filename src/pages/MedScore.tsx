import { useEffect, useState } from 'react'
import {
  Activity,
  HeartPulse,
  Droplets,
  Brain,
  ClipboardList,
  AlertCircle,
  CheckCircle,
  Upload,
  User,
  MessageCircle,
  TrendingUp,
  Loader2,
  Sparkles,
  LineChart,
  Stethoscope,
  Target,
  CalendarDays,
  Gauge,
  Trophy,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { calculateMedScore } from '@/services/calculateMedScore'

export default function MedScore() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [medScore, setMedScore] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])

  useEffect(() => {
    load()
  }, [user])

  async function load() {
    if (!user) return

    const [profileRes, recordsRes, conditionsRes, scoreHistoryRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('medical_records').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('patient_conditions').select('*').eq('user_id', user.id),
      supabase
        .from('health_scores')
        .select('*')
        .eq('user_id', user.id)
        .order('calculated_at', { ascending: true })
        .limit(8),
    ])

    const calculated = calculateMedScore(
      profileRes.data || {},
      recordsRes.data || [],
      conditionsRes.data || []
    )

    setMedScore(calculated)
    setHistory(scoreHistoryRes.data || [])
    setRecords(recordsRes.data || [])
    setLoading(false)
  }

  if (loading || !medScore) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  const metrics = medScore.metrics || {}
  const cockpit = medScore.cockpit || {}
  const delta = getScoreDelta(history, medScore.score)
  const lastUpdate = getLastUpdate(history)
  const lastExamDate = getLastExamDate(records)
  const insights = buildInsights(records, history, medScore, metrics)
  const improveActions = buildImproveActions(medScore)
  const recommendedExams = buildRecommendedExams(medScore, metrics)
  const factors = buildMainFactors(medScore, metrics)
  const potential = buildPotentialScore(medScore, metrics)
  const missingPoints = Math.max(0, 85 - Number(medScore.score || 0))

  const areas = [
    {
      icon: HeartPulse,
      name: 'Cardiovascular',
      score: cardiovascularScore(metrics),
      note: metrics.ldl && metrics.ldl >= 130 ? `LDL ${metrics.ldl}: merece atenção` : 'Sem alerta cardiovascular principal',
    },
    {
      icon: Activity,
      name: 'Metabólico',
      score: metabolicScore(metrics),
      note: metrics.fastingGlucose ? `Glicemia: ${metrics.fastingGlucose}` : 'Glicemia/HbA1c ausente',
    },
    {
      icon: Droplets,
      name: 'Hematológico',
      score: metrics.hemoglobin ? 95 : 55,
      note: metrics.hemoglobin ? 'Hemoglobina avaliada' : 'Hemograma incompleto',
    },
    {
      icon: Stethoscope,
      name: 'Renal',
      score: renalScore(metrics),
      note: metrics.tfg ? `TFG: ${metrics.tfg}` : 'TFG/creatinina ausente',
    },
    {
      icon: Brain,
      name: 'Completude dos dados',
      score: medScore.confidence || 0,
      note: `${medScore.confidence || 0}% de confiança dos dados`,
    },
  ]

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-800 p-5 text-white">
        <p className="text-white/80 text-sm mb-1">Seu MedScore</p>

        <div className="flex items-center gap-4">
          <div className="relative">
            <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="10" />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="white"
                strokeWidth="10"
                strokeDasharray={`${(medScore.score / 100) * 251.2} 251.2`}
                strokeLinecap="round"
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold">{medScore.score}</span>
              <span className="text-xs opacity-80">/100</span>
            </div>
          </div>

          <div className="flex-1">
            <h1 className="text-2xl font-bold">{medScore.level}</h1>

            <p className="text-white/80 text-sm mt-1">
              {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)} pontos desde a última atualização
            </p>

            <p className="text-white/70 text-xs mt-1">
              Última atualização: {lastUpdate}
            </p>

            <p className="text-white/70 text-xs mt-1">
              Último exame: {lastExamDate}
            </p>
          </div>
        </div>
      </div>

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <Gauge className="w-5 h-5 text-emerald-600" />
          Confiabilidade do MedScore
        </h2>

        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-gray-600">Baseado na qualidade e completude dos dados</p>
          <p className="font-bold text-emerald-700">{medScore.confidence || 0}%</p>
        </div>

        <div className="h-3 bg-emerald-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-600"
            style={{ width: `${Math.min(100, medScore.confidence || 0)}%` }}
          />
        </div>
      </section>

      <section className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <h2 className="font-bold text-emerald-900 mb-3 flex items-center gap-2">
          <Target className="w-5 h-5" />
          Sua Meta de Saúde
        </h2>

        <p className="text-sm text-emerald-800">Meta atual: atingir MedScore 85</p>

        <div className="mt-3">
          <div className="h-3 bg-emerald-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600"
              style={{ width: `${Math.min(100, (medScore.score / 85) * 100)}%` }}
            />
          </div>

          <p className="text-xs text-emerald-700 mt-2">
            {missingPoints > 0
              ? `Faltam ${missingPoints} pontos para a próxima meta.`
              : 'Você já atingiu a meta inicial. Agora é manter e evoluir.'}
          </p>
        </div>
      </section>

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-600" />
          Score potencial
        </h2>

        <div className="flex items-center justify-between bg-yellow-50 border border-yellow-100 rounded-xl p-3 mb-3">
          <div>
            <p className="text-xs text-yellow-700">MedScore atual</p>
            <p className="text-2xl font-bold text-yellow-900">{medScore.score}</p>
          </div>

          <div className="text-right">
            <p className="text-xs text-yellow-700">Potencial estimado</p>
            <p className="text-2xl font-bold text-yellow-900">{potential.score}</p>
          </div>
        </div>

        <div className="space-y-2 text-sm text-gray-700">
          {potential.actions.map((item, idx) => (
            <p key={idx}>+{item.points} {item.label}</p>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          Principais fatores do seu score
        </h2>

        <div className="space-y-2">
          {factors.good.map((item, idx) => (
            <p key={`good-${idx}`} className="text-sm text-emerald-700">
              ✔ {item}
            </p>
          ))}

          {factors.attention.map((item, idx) => (
            <p key={`attention-${idx}`} className="text-sm text-red-700">
              ⚠ {item}
            </p>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <LineChart className="w-5 h-5 text-emerald-600" />
          Evolução do MedScore
        </h2>

        <div className="h-28 flex items-end gap-2">
          {buildEvolutionBars(history, medScore.score).map((item, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-emerald-600"
                style={{ height: `${Math.max(18, item.score)}px` }}
              />
              <span className="text-[10px] text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
        <h2 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">
          <Target className="w-5 h-5" />
          Health Wallet Insights
        </h2>

        <div className="space-y-2 text-sm text-indigo-800">
          {insights.map((item, idx) => (
            <p key={idx}>• {item}</p>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-bold mb-3">Próxima Conquista</h2>

        <div className="space-y-2 text-sm text-gray-700">
          <p>🎯 Objetivo: MedScore 85</p>
          <p>Você está a {missingPoints} ponto(s) da meta.</p>
          <p>As ações mais rápidas são:</p>

          <ul className="list-disc pl-5 space-y-1">
            {potential.actions.slice(0, 4).map((item, idx) => (
              <li key={idx}>{item.label}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-emerald-600" />
          Áreas analisadas
        </h2>

        <div className="space-y-4">
          {areas.map((area) => (
            <div key={area.name}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-sm">
                  <area.icon className="w-4 h-4 text-emerald-600" />
                  <span>{area.name}</span>
                </div>
                <span className="text-sm font-semibold">{area.score}%</span>
              </div>

              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full"
                  style={{ width: `${area.score}%` }}
                />
              </div>

              <p className="text-xs text-muted-foreground mt-1">{area.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-purple-50 border border-purple-200 rounded-xl p-4">
        <h2 className="font-bold text-purple-900 mb-3 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Melhore seu MedScore
        </h2>

        <div className="space-y-2 text-sm text-purple-800">
          {improveActions.map((item, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-purple-100 p-3">
              <p className="font-semibold">{item.priority}</p>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <h2 className="font-bold text-yellow-900 mb-2 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Próximos exames recomendados
        </h2>

        <p className="text-sm text-yellow-800 mb-3">
          Estes exames ajudam a refinar seu risco cardiovascular, metabólico e preventivo.
        </p>

        <div className="flex flex-wrap gap-2">
          {recommendedExams.map((exam) => (
            <span key={exam} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
              {exam}
            </span>
          ))}
        </div>

        <Link
          to="/upload"
          className="mt-4 block text-center py-3 rounded-xl bg-yellow-600 text-white font-semibold"
        >
          Enviar exame
        </Link>
      </section>

      {cockpit.strengths?.length > 0 && (
        <section className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <h2 className="font-bold text-emerald-900 mb-3 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Pontos fortes
          </h2>

          <ul className="space-y-2 text-sm text-emerald-800">
            {cockpit.strengths.map((item: string, idx: number) => (
              <li key={idx}>• {item}</li>
            ))}
          </ul>
        </section>
      )}

      {medScore.alerts?.length > 0 && (
        <section className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h2 className="font-bold text-red-900 mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Pontos de atenção
          </h2>

          <ul className="space-y-2 text-sm text-red-800">
            {medScore.alerts.map((item: string, idx: number) => (
              <li key={idx}>• {item}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h2 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
          <MessageCircle className="w-5 h-5" />
          Pergunte ao seu Health Coach
        </h2>

        <div className="grid grid-cols-1 gap-2">
          <CoachButton text="Explique meus exames" />
          <CoachButton text="O que mais reduz meu MedScore?" />
          <CoachButton text="Crie um plano de 30 dias" />
          <CoachButton text="Quais exames devo fazer primeiro?" />
          <CoachButton text="Como reduzir meu LDL naturalmente?" />
          <CoachButton text="Monte um plano para eu atingir MedScore 85" />
        </div>
      </section>

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-bold mb-3">Ações rápidas</h2>

        <div className="grid grid-cols-2 gap-3">
          <Link to="/profile" className="py-3 rounded-xl bg-emerald-600 text-white text-center font-semibold">
            <User className="w-4 h-4 mx-auto mb-1" />
            Atualizar perfil
          </Link>

          <Link to="/upload" className="py-3 rounded-xl bg-violet-600 text-white text-center font-semibold">
            <Upload className="w-4 h-4 mx-auto mb-1" />
            Subir exames
          </Link>

          <Link to="/summary" className="py-3 rounded-xl bg-blue-600 text-white text-center font-semibold">
            Resumo
          </Link>

          <Link to="/chat?context=score" className="py-3 rounded-xl bg-purple-600 text-white text-center font-semibold">
            <MessageCircle className="w-4 h-4 mx-auto mb-1" />
            Health Coach
          </Link>
        </div>
      </section>
    </div>
  )
}

function CoachButton({ text }: { text: string }) {
  return (
    <Link
      to={`/chat?context=score&question=${encodeURIComponent(text)}`}
      className="bg-white border border-blue-100 rounded-xl p-3 text-sm text-blue-800 font-medium"
    >
      {text}
    </Link>
  )
}

function buildPotentialScore(medScore: any, metrics: any) {
  const actions: { label: string; points: number }[] = []
  const missingInfo = medScore.cockpit?.missingInfo || []
  const missingExams = medScore.missingExams || []

  if (missingInfo.includes('Histórico familiar')) {
    actions.push({ label: 'Histórico familiar', points: 4 })
  }

  if (missingInfo.includes('Contato de emergência')) {
    actions.push({ label: 'Contato de emergência', points: 2 })
  }

  if (!metrics.hba1c && missingExams.some((m: string) => m.toLowerCase().includes('glic'))) {
    actions.push({ label: 'HbA1c ou glicemia de jejum', points: 5 })
  }

  if (!metrics.apoB) {
    actions.push({ label: 'ApoB', points: 4 })
  }

  if (!metrics.pcrUltrasensitive) {
    actions.push({ label: 'PCR ultrassensível', points: 3 })
  }

  if (!metrics.tfg) {
    actions.push({ label: 'Creatinina e TFG', points: 2 })
  }

  if (!actions.length) {
    actions.push({ label: 'Manter exames atualizados', points: 2 })
  }

  const score = Math.min(
    100,
    Number(medScore.score || 0) + actions.reduce((sum, item) => sum + item.points, 0)
  )

  return { score, actions }
}

function buildMainFactors(medScore: any, metrics: any) {
  const good: string[] = []
  const attention: string[] = []

  if (metrics.hdl && metrics.hdl >= 40) good.push('HDL adequado')
  if (metrics.fastingGlucose && metrics.fastingGlucose < 100) good.push('Glicemia normal')
  if (metrics.triglycerides && metrics.triglycerides < 150) good.push('Triglicerídeos normais')
  if (metrics.hemoglobin) good.push('Hemograma parcialmente avaliado')

  if (metrics.ldl && metrics.ldl >= 130) attention.push('LDL elevado')
  if (metrics.totalCholesterol && metrics.totalCholesterol >= 190) attention.push('Colesterol total elevado')
  if (metrics.tfg && metrics.tfg < 90) attention.push('TFG abaixo do ideal')

  const missingInfo = medScore.cockpit?.missingInfo || []
  if (missingInfo.includes('Histórico familiar')) attention.push('Dados familiares incompletos')
  if (missingInfo.includes('Peso e altura')) attention.push('Peso e altura incompletos')
  if (missingInfo.includes('Contato de emergência')) attention.push('Contato de emergência não cadastrado')

  if (!good.length) good.push('Dados iniciais organizados no HealthWallet')
  if (!attention.length) attention.push('Nenhum alerta principal identificado no momento')

  return { good, attention }
}

function buildInsights(records: any[], history: any[], medScore: any, metrics: any) {
  const insights: string[] = []

  insights.push(`Você enviou ${records.length} exame(s).`)

  const delta = getScoreDelta(history, medScore.score)
  insights.push(`Seu MedScore ${delta >= 0 ? 'subiu' : 'caiu'} ${Math.abs(delta)} ponto(s) desde a última atualização.`)

  const ldlValues = extractMarkerValues(records, ['ldl'])
  if (ldlValues.length >= 2) {
    const first = ldlValues[0]
    const last = ldlValues[ldlValues.length - 1]
    insights.push(`Seu LDL foi de ${first} para ${last}.`)
  } else if (metrics.ldl) {
    insights.push(`Seu LDL atual é ${metrics.ldl}.`)
  }

  insights.push(`Próximo exame recomendado: ${nextRecommendedExam(medScore, metrics)}.`)

  if (medScore.score < 85) {
    insights.push('Meta para atingir MedScore 85: completar histórico familiar, inserir HbA1c/ApoB e manter exames atualizados.')
  } else {
    insights.push('Meta atual: manter exames e dados atualizados para preservar seu resultado.')
  }

  return insights
}

function extractMarkerValues(records: any[], names: string[]) {
  const values: number[] = []

  records.forEach((record) => {
    const items = record.ai_result?.items || []
    items.forEach((item: any) => {
      const itemName = String(item.name || '').toLowerCase()
      if (names.some((name) => itemName.includes(name))) {
        const value = toNumber(item.value)
        if (value) values.push(value)
      }
    })
  })

  return values
}

function nextRecommendedExam(medScore: any, metrics: any) {
  if (!metrics.ldl || metrics.ldl >= 130) return 'ApoB'
  if (!metrics.fastingGlucose) return 'Hemoglobina glicada'
  if (!metrics.hemoglobin) return 'Hemograma completo'
  if (!metrics.tfg) return 'Creatinina e TFG'
  return 'PCR ultrassensível'
}

function cardiovascularScore(metrics: any) {
  let score = 85
  if (metrics.ldl >= 130) score -= 15
  if (metrics.totalCholesterol >= 190) score -= 8
  if (metrics.hdl && metrics.hdl < 40) score -= 8
  if (metrics.triglycerides >= 150) score -= 8
  return clamp(score)
}

function metabolicScore(metrics: any) {
  if (!metrics.fastingGlucose) return 55
  if (metrics.fastingGlucose < 100) return 92
  if (metrics.fastingGlucose < 126) return 70
  return 45
}

function renalScore(metrics: any) {
  if (!metrics.tfg && !metrics.creatinine) return 55
  if (metrics.tfg && metrics.tfg < 90) return 78
  return 90
}

function buildImproveActions(medScore: any) {
  const actions: { priority: string; text: string }[] = []
  const missing = medScore.missingExams || []
  const missingInfo = medScore.cockpit?.missingInfo || []

  if (missing.some((m: string) => m.toLowerCase().includes('ldl'))) {
    actions.push({ priority: 'Prioridade alta', text: 'Enviar perfil lipídico completo para avaliar melhor risco cardiovascular.' })
  }

  if (missing.includes('Glicemia de jejum')) {
    actions.push({ priority: 'Prioridade alta', text: 'Adicionar glicemia de jejum ou hemoglobina glicada.' })
  }

  if (missing.includes('Hemograma completo')) {
    actions.push({ priority: 'Dados importantes', text: 'Enviar hemograma completo para avaliação hematológica básica.' })
  }

  if (missingInfo.includes('Histórico familiar')) {
    actions.push({ priority: 'Dados importantes', text: 'Cadastrar histórico familiar para refinar risco cardiovascular e preventivo.' })
  }

  if (missingInfo.includes('Peso e altura')) {
    actions.push({ priority: 'Dados importantes', text: 'Atualizar peso e altura para cálculo de IMC e fatores de risco.' })
  }

  if (missingInfo.includes('Contato de emergência')) {
    actions.push({ priority: 'Segurança', text: 'Cadastrar contato de emergência no Prontuário Digital.' })
  }

  if (actions.length === 0) {
    actions.push({ priority: 'Manutenção', text: 'Manter exames atualizados e acompanhar evolução do MedScore.' })
  }

  return actions
}

function buildRecommendedExams(medScore: any, metrics: any) {
  const exams = ['ApoB', 'Lipoproteína(a)', 'Hemoglobina glicada', 'PCR ultrassensível']
  if (!metrics.tfg) exams.push('Creatinina e TFG')
  if (!metrics.hemoglobin) exams.push('Hemograma completo')
  if (!metrics.tsh) exams.push('TSH')
  return [...new Set(exams)]
}

function buildEvolutionBars(history: any[], currentScore: number) {
  if (!history.length) {
    return [
      { label: '1', score: Math.max(30, currentScore - 20) },
      { label: '2', score: Math.max(35, currentScore - 15) },
      { label: '3', score: Math.max(40, currentScore - 10) },
      { label: '4', score: Math.max(45, currentScore - 5) },
      { label: 'Atual', score: currentScore },
    ]
  }

  const parsed = history.slice(-5).map((item, idx) => ({
    label: idx === history.slice(-5).length - 1 ? 'Atual' : `${idx + 1}`,
    score: Number(item.score || 0),
  }))

  return parsed.length >= 2 ? parsed : [...parsed, { label: 'Atual', score: currentScore }]
}

function getScoreDelta(history: any[], currentScore: number) {
  if (!history || history.length < 2) return 0
  const previous = Number(history[history.length - 2]?.score || currentScore)
  return Number(currentScore) - previous
}

function getLastUpdate(history: any[]) {
  const last = history?.[history.length - 1]
  const date = last?.calculated_at || new Date().toISOString()
  return new Date(date).toLocaleDateString('pt-BR')
}

function getLastExamDate(records: any[]) {
  if (!records.length) return 'Nenhum exame enviado'
  const last = records[records.length - 1]
  const date = last?.created_at || last?.exam_date
  return date ? new Date(date).toLocaleDateString('pt-BR') : 'Não informado'
}

function toNumber(value: any) {
  return Number(String(value || '').replace(',', '.').replace(/[^\d.]/g, '')) || 0
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}
