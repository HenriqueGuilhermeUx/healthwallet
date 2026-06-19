import {
  Loader2,
  Activity,
  QrCode,
  Pill,
  Calendar,
  Shield,
  ChevronRight,
  FileText,
  Users,
  MessageCircle,
  Sparkles,
  TrendingUp,
  HeartPulse,
  Target,
  AlertCircle,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { calculateMedScore } from '@/services/calculateMedScore'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const [loading, setLoading] = useState(true)
  const [medScore, setMedScore] = useState<any>(null)
  const [stats, setStats] = useState({
    exams: 0,
    medications: 0,
    cards: 0,
    family: 0,
  })

  const [nextEvent, setNextEvent] = useState<any>(null)
  const [nextMedication, setNextMedication] = useState<any>(null)
  const [lastExam, setLastExam] = useState<any>(null)
  const [scoreChange, setScoreChange] = useState(0)
  const [insights, setInsights] = useState<string[]>([])

  useEffect(() => {
    loadDashboardData()
  }, [user])

  async function loadDashboardData() {
    if (!user) return

    try {
      const [
        profileRes,
        examsCount,
        medsCount,
        cardsCount,
        familyCount,
        conditionsRes,
        recordsRes,
        timelineRes,
        activeMedsRes,
        lastScoreRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),

        supabase
          .from('medical_records')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id),

        supabase
          .from('medications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_active', true),

        supabase
          .from('health_plans')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id),

        supabase
          .from('family_members')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id),

        supabase
          .from('patient_conditions')
          .select('*')
          .eq('user_id', user.id),

        supabase
          .from('medical_records')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10),

        supabase
          .from('medical_events')
          .select('*')
          .eq('user_id', user.id)
          .order('event_date', { ascending: true }),

        supabase
          .from('medications')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(5),

        supabase
          .from('health_scores')
          .select('*')
          .eq('user_id', user.id)
          .order('calculated_at', { ascending: false })
          .limit(2),
      ])

      const records = recordsRes.data || []
      const profile = profileRes.data || {}
      const calculated = calculateMedScore(
        profile,
        records,
        conditionsRes.data || []
      )

      await supabase.from('health_scores').insert({
        user_id: user.id,
        score: calculated.score,
        status: calculated.level,
        factors: {
          confidence: calculated.confidence,
          levelColor: calculated.levelColor,
          missingExams: calculated.missingExams,
          alerts: calculated.alerts,
          recommendations: calculated.recommendations,
          metrics: calculated.metrics,
          breakdown: calculated.breakdown,
          cockpit: calculated.cockpit,
        },
        calculated_at: new Date().toISOString(),
      })

      setStats({
        exams: examsCount.count || 0,
        medications: medsCount.count || 0,
        cards: cardsCount.count || 0,
        family: familyCount.count || 0,
      })

      const today = new Date().toISOString().slice(0, 10)

      const futureEvents = (timelineRes.data || []).filter(
        (event: any) => event.event_date >= today
      )

      setNextEvent(futureEvents[0] || null)
      setNextMedication(activeMedsRes.data?.[0] || null)
      setLastExam(records[0] || null)

      let delta = 0

      if (lastScoreRes.data && lastScoreRes.data.length >= 2) {
        delta =
          Number(lastScoreRes.data[0].score || 0) -
          Number(lastScoreRes.data[1].score || 0)
      }

      setScoreChange(delta)
      setInsights(buildDashboardInsights(records, calculated, delta))
      setMedScore(calculated)
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    await signOut()
    window.location.href = '/'
  }

  const userName =
    user?.user_metadata?.full_name?.split(' ')[0] ||
    user?.user_metadata?.name?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'Usuário'

  if (loading || !medScore) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-20">
      <Link
        to="/medscore"
        className="block rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-5 text-white relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative">
          <p className="text-white/80 text-sm mb-1">Olá, {userName}</p>

          <div className="flex items-center gap-4">
            <div className="relative">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="10"
                />
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
                <span className="text-2xl font-bold">{medScore.score}</span>
                <span className="text-xs opacity-80">/100</span>
              </div>
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4" />
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider">
                  MedScore
                </p>
              </div>

              <h1 className="text-2xl font-bold">
                Acesse seu MedScore
              </h1>

              <p className="text-white/80 text-sm mt-1">
                Veja áreas analisadas, melhorias possíveis e exames recomendados.
              </p>

              <div className="flex items-center gap-2 mt-3">
                <TrendingUp className="w-4 h-4 text-emerald-300" />
                <span className="text-xs text-white/80">
                  {medScore.confidence}% de confiança dos dados
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>

      <section className="bg-white rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <HeartPulse className="w-5 h-5 text-emerald-600" />
          <h2 className="font-bold">Dashboard de Saúde</h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DailyCard
            title="Próximo compromisso"
            value={nextEvent ? nextEvent.title : 'Nenhum agendado'}
            subtitle={nextEvent ? formatDate(nextEvent.event_date) : 'Adicione na Agenda'}
          />

          <DailyCard
            title="Próximo medicamento"
            value={
              nextMedication?.name ||
              nextMedication?.medication_name ||
              'Nenhum ativo'
            }
            subtitle={
              nextMedication?.reminder_time
                ? `Lembrete às ${nextMedication.reminder_time}`
                : nextMedication?.frequency || 'Cadastre medicamentos'
            }
          />

          <DailyCard
            title="Último exame"
            value={lastExam?.file_name || lastExam?.exam_type || 'Nenhum exame'}
            subtitle={lastExam ? formatDate(lastExam.created_at) : 'Envie seu primeiro exame'}
          />

          <DailyCard
            title="Mudança MedScore"
            value={
              scoreChange > 0
                ? `+${scoreChange}`
                : scoreChange < 0
                  ? `${scoreChange}`
                  : '0'
            }
            subtitle="desde a última atualização"
          />
        </div>
      </section>

      <section className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-indigo-600" />
          <h2 className="font-bold text-indigo-900">Insights de Saúde</h2>
        </div>

        <div className="space-y-2 text-sm text-indigo-800">
          {insights.map((insight, index) => (
            <p key={index}>• {insight}</p>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <ActionCard icon={Activity} label="Exames" value={stats.exams} href="/exams" />
        <ActionCard icon={Pill} label="Remédios" value={stats.medications} href="/medications" />
        <ActionCard icon={FileText} label="Carteiras Plano/SUS" value={stats.cards} href="/wallet" />
        <ActionCard icon={Users} label="Família" value={stats.family} href="/family" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/upload" className="p-4 rounded-xl bg-violet-600 text-white font-semibold text-center">
          Subir exames
        </Link>
        <Link to="/profile" className="p-4 rounded-xl bg-emerald-600 text-white font-semibold text-center">
          Atualizar dados
        </Link>
        <Link to="/summary" className="p-4 rounded-xl bg-blue-600 text-white font-semibold text-center">
          Resumo
        </Link>
        <Link to="/chat" className="p-4 rounded-xl bg-purple-600 text-white font-semibold text-center">
          Conversar com IA
        </Link>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <MenuItem icon={QrCode} label="Carteiras Plano/SUS" href="/wallet" />
        <MenuItem icon={Calendar} label="Agenda de Saúde" href="/timeline" />
        <MenuItem icon={Shield} label="Prontuário Digital" href="/passport" />
        <MenuItem icon={Users} label="Membros da Família" href="/family" />
        <MenuItem icon={MessageCircle} label="Assistente de IA" href="/chat" last />
      </div>

      <button
        onClick={handleLogout}
        className="w-full py-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors text-sm font-medium"
      >
        Sair da conta
      </button>
    </div>
  )
}

function buildDashboardInsights(records: any[], medScore: any, scoreChange: number) {
  const insights: string[] = []

  insights.push(`Você enviou ${records.length} exame(s) até agora.`)

  if (scoreChange > 0) {
    insights.push(`Seu MedScore subiu ${scoreChange} ponto(s) desde a última atualização.`)
  } else if (scoreChange < 0) {
    insights.push(`Seu MedScore caiu ${Math.abs(scoreChange)} ponto(s); vale revisar pontos de atenção.`)
  } else {
    insights.push('Seu MedScore está estável desde a última atualização.')
  }

  const ldlValues = extractMarkerValues(records, ['ldl'])

  if (ldlValues.length >= 2) {
    const first = ldlValues[ldlValues.length - 1]
    const last = ldlValues[0]

    insights.push(`Seu LDL foi de ${first} para ${last}.`)
  } else if (ldlValues.length === 1) {
    insights.push(`Seu LDL atual registrado é ${ldlValues[0]}.`)
  }

  const missing = medScore.missingExams || []
  const nextExam =
    missing.find((item: string) => item.toLowerCase().includes('glic')) ||
    missing.find((item: string) => item.toLowerCase().includes('hemograma')) ||
    missing[0] ||
    'ApoB'

  insights.push(`Próximo exame recomendado: ${nextExam}.`)

  if (medScore.score < 85) {
    insights.push('Meta: chegar ao MedScore 85 mantendo exames atualizados e completando dados importantes.')
  } else {
    insights.push('Meta: manter seu MedScore com exames e informações sempre atualizados.')
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

function toNumber(value: any) {
  return Number(String(value || '').replace(',', '.').replace(/[^\d.]/g, '')) || 0
}

function DailyCard({ title, value, subtitle }: any) {
  return (
    <div className="bg-muted/40 rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="font-bold mt-1 line-clamp-2">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
    </div>
  )
}

function ActionCard({ icon: Icon, label, value, href }: any) {
  return (
    <Link to={href} className="bg-card rounded-xl border border-border p-4">
      <Icon className="w-5 h-5 text-emerald-600 mb-2" />
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Link>
  )
}

function MenuItem({ icon: Icon, label, href, last }: any) {
  return (
    <Link
      to={href}
      className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors ${
        !last ? 'border-b border-border' : ''
      }`}
    >
      <Icon className="w-5 h-5 text-muted-foreground" />
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </Link>
  )
}

function formatDate(date: string) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('pt-BR')
}
