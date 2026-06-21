import {
  Loader2,
  Calendar,
  FileText,
  Users,
  MessageCircle,
  Sparkles,
  TrendingUp,
  HeartPulse,
  Target,
  Upload,
  User,
  Shield,
  Share2,
  CreditCard,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  Pill,
  Bell,
  Lock,
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
  const [nextEvent, setNextEvent] = useState<any>(null)
  const [nextReminder, setNextReminder] = useState<any>(null)
  const [nextMedication, setNextMedication] = useState<any>(null)
  const [lastExam, setLastExam] = useState<any>(null)
  const [scoreChange, setScoreChange] = useState(0)
  const [insights, setInsights] = useState<string[]>([])
  const [activeShares, setActiveShares] = useState(0)
  const [showHealthDashboard, setShowHealthDashboard] = useState(true)
  const [profileGender, setProfileGender] = useState('')

  useEffect(() => {
    loadDashboardData()
  }, [user])

  async function loadDashboardData() {
    if (!user) return

    try {
      const today = new Date().toISOString().slice(0, 10)
      const now = new Date().toISOString()

      const [
        profileRes,
        conditionsRes,
        recordsRes,
        timelineRes,
        activeMedsRes,
        lastScoreRes,
        remindersRes,
        sharesRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),

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
          .gte('event_date', today)
          .order('event_date', { ascending: true })
          .limit(5),

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

        supabase
          .from('health_reminders')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .gte('reminder_date', today)
          .order('reminder_date', { ascending: true })
          .order('reminder_time', { ascending: true })
          .limit(5),

        supabase
          .from('access_codes')
          .select('*')
          .eq('patient_id', user.id)
          .eq('revoked', false)
          .gt('expires_at', now),
      ])

      const records = recordsRes.data || []
      const profile = profileRes.data || {}

      setProfileGender(profile.gender || '')

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

      setNextEvent(timelineRes.data?.[0] || null)
      setNextReminder(remindersRes.data?.[0] || null)
      setNextMedication(activeMedsRes.data?.[0] || null)
      setLastExam(records[0] || null)
      setActiveShares(sharesRes.data?.length || 0)

      let delta = 0

      if (lastScoreRes.data && lastScoreRes.data.length >= 2) {
        delta =
          Number(lastScoreRes.data[0].score || 0) -
          Number(lastScoreRes.data[1].score || 0)
      }

      setScoreChange(delta)
      setInsights(buildDashboardInsights(records, calculated, delta, activeMedsRes.data || [], sharesRes.data || []))
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
        className="block rounded-2xl bg-gradient-to-br from-emerald-700 via-teal-700 to-cyan-800 p-5 text-white relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative">
          <p className="text-white/80 text-sm mb-1">Olá, {userName}</p>

          <div className="flex items-center gap-4">
            <div className="relative">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
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

              <h1 className="text-2xl font-bold">Acesse seu MedScore</h1>

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

      <button
        onClick={() => setShowHealthDashboard(!showHealthDashboard)}
        className="w-full bg-white rounded-xl border border-border p-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <HeartPulse className="w-5 h-5 text-emerald-600" />
          <span className="font-bold">Dashboard de Saúde</span>
        </div>

        {showHealthDashboard ? (
          <ChevronUp className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        )}
      </button>

      {showHealthDashboard && (
        <>
          <section className="bg-white rounded-xl border border-border p-4">
            <h2 className="font-bold mb-3">Resumo do seu dia</h2>

            <div className="grid grid-cols-2 gap-3">
              <DailyCard
                icon={Calendar}
                title="Próximo compromisso"
                value={nextEvent ? nextEvent.title : 'Nenhum agendado'}
                subtitle={nextEvent ? formatDate(nextEvent.event_date) : 'Adicionar na Agenda'}
              />

              <DailyCard
                icon={Bell}
                title="Próximo lembrete"
                value={nextReminder ? nextReminder.title : 'Nenhum lembrete'}
                subtitle={
                  nextReminder
                    ? `${formatDate(nextReminder.reminder_date)} ${nextReminder.reminder_time ? `às ${String(nextReminder.reminder_time).slice(0, 5)}` : ''}`
                    : 'Criar lembrete'
                }
              />

              <DailyCard
                icon={Pill}
                title="Próximo medicamento"
                value={nextMedication?.name || nextMedication?.medication_name || 'Nenhum ativo'}
                subtitle={
                  nextMedication?.reminder_time
                    ? `Lembrete às ${String(nextMedication.reminder_time).slice(0, 5)}`
                    : nextMedication?.frequency || 'Cadastre medicamentos'
                }
              />

              <DailyCard
                icon={FileText}
                title="Último exame"
                value={lastExam?.file_name || lastExam?.exam_type || 'Nenhum exame'}
                subtitle={lastExam ? formatDate(lastExam.created_at) : 'Envie seu primeiro exame'}
              />

              <DailyCard
                icon={TrendingUp}
                title="Mudança MedScore"
                value={scoreChange > 0 ? `+${scoreChange}` : scoreChange < 0 ? `${scoreChange}` : '0'}
                subtitle="desde a última atualização"
              />

              <DailyCard
                icon={Lock}
                title="Compartilhamentos"
                value={`${activeShares} ativo(s)`}
                subtitle="com profissionais"
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
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <AppButton to="/upload" icon={Upload} label="Upload de Exame" color="bg-violet-600" />
        <AppButton to="/marketplace" icon={ShoppingBag} label="Medicamentos e Exames" color="bg-lime-600" />
        <AppButton to="/profile" icon={User} label="Meu Perfil" color="bg-emerald-600" />
        <AppButton to="/summary" icon={FileText} label="Resumo" color="bg-blue-600" />
        <AppButton to="/chat" icon={MessageCircle} label="Health Coach" color="bg-purple-600" />
        <AppButton to="/passport" icon={Shield} label="Passport" color="bg-orange-600" />
        <AppButton to="/share" icon={Share2} label="Compartilhar Dados" color="bg-cyan-600" />
        <AppButton to="/wallet" icon={CreditCard} label="Carteiras Plano/SUS" color="bg-indigo-600" />
        <AppButton to="/timeline" icon={Calendar} label="Agenda de Saúde" color="bg-pink-600" />
        <AppButton to="/family" icon={Users} label="Família" color="bg-teal-600" />

        {profileGender === 'female' && (
          <AppButton to="/womens-health" icon={HeartPulse} label="Saúde da Mulher" color="bg-rose-600" />
        )}
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

function buildDashboardInsights(
  records: any[],
  medScore: any,
  scoreChange: number,
  medications: any[],
  shares: any[]
) {
  const insights: string[] = []

  insights.push(`Você enviou ${records.length} exame(s) até agora.`)

  if (scoreChange > 0) {
    insights.push(`Seu MedScore subiu ${scoreChange} ponto(s) desde a última atualização.`)
  } else if (scoreChange < 0) {
    insights.push(`Seu MedScore caiu ${Math.abs(scoreChange)} ponto(s); vale revisar pontos de atenção.`)
  } else {
    insights.push('Seu MedScore está estável desde a última atualização.')
  }

  if (medications.length > 0) {
    insights.push(`Você tem ${medications.length} medicamento(s) ativo(s) cadastrado(s).`)
  }

  if (shares.length > 0) {
    insights.push(`Você tem ${shares.length} compartilhamento(s) ativo(s) com profissionais.`)
  }

  const missing = medScore.missingExams || []
  const nextExam =
    missing.find((item: string) => item.toLowerCase().includes('glic')) ||
    missing.find((item: string) => item.toLowerCase().includes('hemograma')) ||
    missing[0] ||
    'ApoB'

  insights.push(`Próximo exame recomendado: ${nextExam}.`)

  return insights
}

function DailyCard({ icon: Icon, title, value, subtitle }: any) {
  return (
    <div className="bg-muted/40 rounded-xl border border-border p-3">
      <Icon className="w-4 h-4 text-emerald-600 mb-1" />
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="font-bold mt-1 line-clamp-2">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
    </div>
  )
}

function AppButton({ to, icon: Icon, label, color }: any) {
  return (
    <Link
      to={to}
      className={`p-4 rounded-xl ${color} text-white font-semibold text-center flex flex-col items-center justify-center gap-2 min-h-[92px]`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-sm leading-tight">{label}</span>
    </Link>
  )
}

function formatDate(date: string) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('pt-BR')
}
