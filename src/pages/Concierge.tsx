import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileUp,
  HeartPulse,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Target,
  Users,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { listMyConciergeActions, listMyConciergeRequests, listMyConciergeTeam, listMyProgramEnrollments } from '@/services/concierge'

type PendingItem = {
  id: string
  title: string
  subtitle?: string
  href: string
}

function formatDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('pt-BR')
}

const roleLabels: Record<string, string> = {
  nurse: 'Enfermeira de referência',
  doctor: 'Médico de referência',
  care_coordinator: 'Coordenador de cuidado',
  specialist: 'Especialista parceiro',
}

export default function Concierge() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [latestScore, setLatestScore] = useState<any>(null)
  const [previousScore, setPreviousScore] = useState<any>(null)
  const [reminders, setReminders] = useState<any[]>([])
  const [nextAppointment, setNextAppointment] = useState<any>(null)
  const [team, setTeam] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [actions, setActions] = useState<any[]>([])
  const [programs, setPrograms] = useState<any[]>([])
  const [conciergeReady, setConciergeReady] = useState(true)

  useEffect(() => {
    if (!user) return
    void loadConcierge()
  }, [user?.id])

  async function loadConcierge() {
    if (!user) return
    setLoading(true)

    try {
      const today = new Date().toISOString().slice(0, 10)
      const [scoresRes, remindersRes, appointmentRes] = await Promise.all([
        supabase.from('health_scores').select('*').eq('user_id', user.id).order('calculated_at', { ascending: false }).limit(2),
        supabase.from('health_reminders').select('*').eq('user_id', user.id).eq('is_active', true).gte('reminder_date', today).order('reminder_date', { ascending: true }).limit(5),
        supabase.from('telemedicine_appointments').select('*').eq('user_id', user.id).in('status', ['requested', 'scheduled', 'confirmed']).gte('preferred_date', today).order('preferred_date', { ascending: true }).limit(1),
      ])

      const scores = scoresRes.data || []
      setLatestScore(scores[0] || null)
      setPreviousScore(scores[1] || null)
      setReminders(remindersRes.data || [])
      setNextAppointment(appointmentRes.data?.[0] || null)

      try {
        const [teamData, requestData, actionData, programData] = await Promise.all([
          listMyConciergeTeam(user.id),
          listMyConciergeRequests(user.id),
          listMyConciergeActions(user.id),
          listMyProgramEnrollments(user.id),
        ])
        setTeam(teamData)
        setRequests(requestData)
        setActions(actionData)
        setPrograms(programData)
        setConciergeReady(true)
      } catch (error) {
        console.warn('Concierge data model not activated yet:', error)
        setConciergeReady(false)
        setTeam([])
        setRequests([])
        setActions([])
        setPrograms([])
      }
    } catch (error) {
      console.warn('Concierge dashboard loaded with partial data:', error)
    } finally {
      setLoading(false)
    }
  }

  const score = Number(latestScore?.score || 0)
  const scoreDelta = latestScore && previousScore
    ? Number(latestScore.score || 0) - Number(previousScore.score || 0)
    : 0

  const activeRequests = requests.filter((item) => !['resolved', 'closed'].includes(item.status))
  const pendingActions = actions.filter((item) => !['completed', 'cancelled'].includes(item.status))
  const activePrograms = programs.filter((item) => item.status === 'active')

  const pendingItems = useMemo<PendingItem[]>(() => {
    const items: PendingItem[] = pendingActions.slice(0, 3).map((item: any) => ({
      id: `action-${item.id}`,
      title: item.title,
      subtitle: item.due_date ? `Até ${formatDate(item.due_date)}` : 'Plano de ação',
      href: '/concierge/plan',
    }))

    if (items.length === 0) {
      reminders.slice(0, 2).forEach((item: any) => items.push({
        id: `reminder-${item.id}`,
        title: item.title || 'Ação de saúde pendente',
        subtitle: formatDate(item.reminder_date) || undefined,
        href: '/dashboard',
      }))
    }

    if (nextAppointment && items.length < 4) {
      items.push({
        id: `appointment-${nextAppointment.id}`,
        title: 'Próxima consulta',
        subtitle: formatDate(nextAppointment.preferred_date) || undefined,
        href: '/telemedicine',
      })
    }

    return items.slice(0, 4)
  }, [pendingActions, reminders, nextAppointment])

  const firstName = user?.user_metadata?.full_name?.split(' ')[0]
    || user?.user_metadata?.name?.split(' ')[0]
    || user?.email?.split('@')[0]
    || 'Olá'

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
  }

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-emerald-700 via-teal-700 to-cyan-800 p-5 text-white overflow-hidden relative">
        <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10" />
        <div className="relative">
          <div className="flex items-center gap-2 text-sm text-white/80"><ShieldCheck className="h-4 w-4" /> HealthWallet Concierge</div>
          <h1 className="mt-2 text-2xl font-bold">Olá, {firstName}</h1>
          <p className="mt-1 text-sm text-white/80">Sua saúde acompanhada, organizada e coordenada ao longo do tempo.</p>

          <Link to="/medscore" className="mt-5 flex items-center justify-between rounded-2xl bg-white/10 p-4 backdrop-blur">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/70"><Sparkles className="h-4 w-4" /> MedScore atual</div>
              <div className="mt-1 flex items-end gap-2"><span className="text-4xl font-bold">{score || '—'}</span>{score > 0 && <span className="pb-1 text-sm text-white/70">/100</span>}</div>
              {scoreDelta !== 0 && <p className="mt-1 text-xs text-white/80">{scoreDelta > 0 ? '↑' : '↓'} {Math.abs(scoreDelta)} ponto(s) desde a avaliação anterior</p>}
            </div>
            <ChevronRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {!conciergeReady && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          O Concierge está em desenvolvimento nesta branch. O HealthWallet continua funcionando normalmente; o motor operacional será ativado somente na validação, antes de publicação.
        </section>
      )}

      <section className="grid grid-cols-3 gap-3">
        <MiniStat label="Casos ativos" value={activeRequests.length} />
        <MiniStat label="Próximas ações" value={pendingActions.length} />
        <MiniStat label="Programas" value={activePrograms.length} />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-gray-900">O que importa agora</h2><Link to="/concierge/plan" className="text-xs font-semibold text-emerald-700">Plano completo</Link></div>
        <div className="space-y-2">
          {pendingItems.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 flex gap-3"><CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" /><div><p className="font-semibold text-sm">Nenhuma pendência importante agora</p><p className="text-xs text-muted-foreground mt-1">Sua equipe e o HealthWallet continuarão acompanhando seus próximos passos.</p></div></div>
          ) : pendingItems.map((item) => (
            <Link key={item.id} to={item.href} className="flex items-center gap-3 rounded-2xl border bg-white p-4"><CalendarClock className="h-5 w-5 text-amber-600 flex-shrink-0" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.title}</p>{item.subtitle && <p className="text-xs text-muted-foreground mt-1">{item.subtitle}</p>}</div><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-gray-900">Minha equipe</h2><Link to="/concierge/team" className="text-xs font-semibold text-emerald-700">Ver equipe</Link></div>
        {team.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white p-5"><div className="flex items-center gap-3"><Users className="h-6 w-6 text-emerald-700" /><div><p className="font-semibold">Sua equipe aparecerá aqui</p><p className="text-xs text-muted-foreground mt-1">No Concierge, você terá profissionais de referência acompanhando sua jornada.</p></div></div></div>
        ) : (
          <div className="grid gap-3">
            {team.slice(0, 2).map((item) => (
              <div key={item.id} className="rounded-2xl border bg-white p-4 flex items-center gap-3"><div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center"><Stethoscope className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="font-semibold truncate">{item.professional_name || 'Profissional de saúde'}</p><p className="text-xs text-muted-foreground mt-1">{roleLabels[item.role] || item.role}</p></div><Link to="/chat" className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Conversar</Link></div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-bold text-gray-900">Como podemos ajudar?</h2>
        <div className="grid grid-cols-2 gap-3">
          <ActionCard icon={MessageCircle} title="Solicitar ajuda" subtitle="Sintoma, dúvida ou orientação" href="/concierge/request" />
          <ActionCard icon={ClipboardList} title="Minhas solicitações" subtitle="Acompanhe cada caso" href="/concierge/requests" />
          <ActionCard icon={Target} title="Plano de ação" subtitle="Pendências e próximos passos" href="/concierge/plan" />
          <ActionCard icon={Activity} title="Programas" subtitle="Jornadas de acompanhamento" href="/concierge/programs" />
          <ActionCard icon={FileUp} title="Enviar exame" subtitle="Organize e compartilhe" href="/upload" />
          <ActionCard icon={HeartPulse} title="Minha saúde" subtitle="Score, histórico e evolução" href="/medscore" />
          <ActionCard icon={Users} title="Minha família" subtitle="Cuide de quem importa" href="/family" />
          <ActionCard icon={Stethoscope} title="Consulta" subtitle="Quando a equipe indicar ou você precisar" href="/telemedicine" />
        </div>
      </section>

      <section className="rounded-2xl border bg-slate-50 p-4">
        <div className="flex gap-3"><Activity className="h-5 w-5 text-teal-700 flex-shrink-0" /><div><p className="text-sm font-semibold">Coordenação contínua, não pronto atendimento</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">O Concierge organiza sua jornada e conecta você à equipe certa. Em situações de emergência, procure imediatamente o serviço de urgência da sua região.</p></div></div>
      </section>
    </div>
  )
}

function ActionCard({ icon: Icon, title, subtitle, href }: { icon: any; title: string; subtitle: string; href: string }) {
  return <Link to={href} className="rounded-2xl border bg-white p-4 min-h-[132px] flex flex-col"><div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center"><Icon className="h-5 w-5" /></div><p className="mt-3 text-sm font-bold text-gray-900">{title}</p><p className="mt-1 text-xs text-muted-foreground leading-relaxed">{subtitle}</p></Link>
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border bg-white p-3 text-center"><p className="text-xl font-bold text-gray-900">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>
}
