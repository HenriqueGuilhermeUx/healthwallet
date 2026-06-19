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

  useEffect(() => {
    load()
  }, [user])

  async function load() {
    if (!user) return

    const [profileRes, recordsRes, conditionsRes, scoreHistoryRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('medical_records').select('*').eq('user_id', user.id),
      supabase.from('patient_conditions').select('*').eq('user_id', user.id),
      supabase
        .from('health_scores')
        .select('*')
        .eq('user_id', user.id)
        .order('calculated_at', { ascending: true })
        .limit(6),
    ])

    const calculated = calculateMedScore(
      profileRes.data || {},
      recordsRes.data || [],
      conditionsRes.data || []
    )

    setMedScore(calculated)
    setHistory(scoreHistoryRes.data || [])
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

  const improveActions = buildImproveActions(medScore)
  const recommendedExams = buildRecommendedExams(medScore, metrics)

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white">
        <p className="text-white/80 text-sm mb-1">Seu índice de saúde</p>

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
            <h1 className="text-2xl font-bold">MedScore {medScore.level}</h1>

            <p className="text-white/80 text-sm mt-1">
              {medScore.confidence}% de confiança dos dados
            </p>

            <p className="text-white/70 text-xs mt-2">
              Baseado em exames, perfil, hábitos e histórico clínico.
            </p>
          </div>
        </div>
      </div>

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

        <p className="text-xs text-muted-foreground mt-3">
          Conforme você adiciona exames e informações, o MedScore se torna mais preciso.
        </p>
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
        <h2 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          Seu próximo passo
        </h2>

        <p className="text-sm text-blue-800">
          Atualize dados faltantes, envie exames recentes e mantenha seu histórico organizado para aumentar a precisão do MedScore.
        </p>
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
    label: idx === history.length - 1 ? 'Atual' : `${idx + 1}`,
    score: Number(item.score || 0),
  }))

  return parsed.length >= 2 ? parsed : [...parsed, { label: 'Atual', score: currentScore }]
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}
