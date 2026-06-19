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
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { calculateMedScore } from '@/services/calculateMedScore'

export default function MedScore() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [medScore, setMedScore] = useState<any>(null)

  useEffect(() => {
    load()
  }, [user])

  async function load() {
    if (!user) return

    const [profileRes, recordsRes, conditionsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('medical_records').select('*').eq('user_id', user.id),
      supabase.from('patient_conditions').select('*').eq('user_id', user.id),
    ])

    const calculated = calculateMedScore(
      profileRes.data || {},
      recordsRes.data || [],
      conditionsRes.data || []
    )

    setMedScore(calculated)
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
      score: getAreaScore([
        metrics.ldl,
        metrics.hdl,
        metrics.triglycerides,
        metrics.totalCholesterol,
      ]),
      note: metrics.ldl && metrics.ldl >= 130 ? 'LDL merece atenção' : 'Sem alerta principal',
    },
    {
      icon: Activity,
      name: 'Metabólico',
      score: metrics.fastingGlucose ? (metrics.fastingGlucose < 100 ? 92 : 70) : 55,
      note: metrics.fastingGlucose ? `Glicemia: ${metrics.fastingGlucose}` : 'Glicemia ausente',
    },
    {
      icon: Droplets,
      name: 'Hematológico',
      score: metrics.hemoglobin ? 95 : 55,
      note: metrics.hemoglobin ? 'Hemoglobina avaliada' : 'Hemograma incompleto',
    },
    {
      icon: Brain,
      name: 'Completude dos dados',
      score: medScore.confidence || 0,
      note: `${medScore.confidence || 0}% de confiança`,
    },
  ]

  const improveActions = [
    ...buildImproveActions(medScore),
  ]

  const recommendedExams = [
    'ApoB',
    'Lipoproteína(a)',
    'Hemoglobina glicada',
    'PCR ultrassensível',
  ]

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white">
        <p className="text-white/80 text-sm mb-1">Meu MedScore</p>

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

          <div>
            <h1 className="text-2xl font-bold">{medScore.level}</h1>
            <p className="text-white/80 text-sm">
              {medScore.confidence}% de confiança dos dados
            </p>
          </div>
        </div>
      </div>

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
              <p className="font-semibold">{item.points}</p>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <h2 className="font-bold text-yellow-900 mb-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Exames recomendados
        </h2>

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

function getAreaScore(values: any[]) {
  const available = values.filter((v) => v !== null && v !== undefined)

  if (available.length === 0) return 50

  let score = 80

  available.forEach((value) => {
    if (Number(value) >= 130) score -= 10
  })

  return Math.max(40, Math.min(100, score))
}

function buildImproveActions(medScore: any) {
  const actions: { points: string; text: string }[] = []

  const missing = medScore.missingExams || []
  const missingInfo = medScore.cockpit?.missingInfo || []

  if (missing.includes('Hemograma completo')) {
    actions.push({ points: '+4 pontos possíveis', text: 'Enviar hemograma completo.' })
  }

  if (missing.includes('Glicemia de jejum')) {
    actions.push({ points: '+4 pontos possíveis', text: 'Adicionar glicemia de jejum ou hemoglobina glicada.' })
  }

  if (missing.some((m: string) => m.toLowerCase().includes('ldl'))) {
    actions.push({ points: '+5 pontos possíveis', text: 'Enviar perfil lipídico completo.' })
  }

  if (missingInfo.includes('Histórico familiar')) {
    actions.push({ points: '+3 pontos possíveis', text: 'Cadastrar histórico familiar.' })
  }

  if (missingInfo.includes('Peso e altura')) {
    actions.push({ points: '+3 pontos possíveis', text: 'Atualizar peso e altura.' })
  }

  if (actions.length === 0) {
    actions.push({ points: 'Próxima melhoria', text: 'Manter exames atualizados e acompanhar evolução.' })
  }

  return actions
}
