import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileUp,
  HeartPulse,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

type CareLink = {
  id: string
  status?: string
  professional_name?: string | null
  professional_email?: string | null
  metadata?: Record<string, any> | null
}

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

function professionalRole(item: CareLink) {
  const raw = String(
    item.metadata?.care_role
      || item.metadata?.role
      || item.metadata?.professional_role
      || item.metadata?.specialty
      || '',
  ).toLowerCase()

  if (raw.includes('enferm')) return 'Enfermeira de referência'
  if (raw.includes('méd') || raw.includes('med') || raw.includes('clín')) return 'Médico de referência'
  return 'Profissional da sua equipe'
}

export default function Concierge() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [latestScore, setLatestScore] = useState<any>(null)
  const [previousScore, setPreviousScore] = useState<any>(null)
  const [careLinks, setCareLinks] = useState<CareLink[]>([])
  const [reminders, setReminders] = useState<any[]>([])
  const [nextAppointment, setNextAppointment] = useState<any>(null)

  useEffect(() => {
    if (!user) return
    void loadConcierge()
  }, [user?.id])

  async function loadConcierge() {
    if (!user) return
    setLoading(true)

    try {
      const today = new Date().toISOString().slice(0, 10)
      const email = user.email || ''

      const careQueries = [
        supabase
          .from('professional_care_links')
          .select('*')
          .eq('patient_id', user.id)
          .eq('status', 'active')
          .order('updated_at', { ascending: false }),
      ]

      if (email) {
        careQueries.push(
          supabase
            .from('professional_care_links')
            .select('*')
            .ilike('patient_email', email)
            .eq('status', 'active')
            .order('updated_at', { ascending: false }),
        )
      }

      const [scoresRes, remindersRes, appointmentRes, ...careResults] = await Promise.all([
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
          .limit(5),
        supabase
          .from('telemedicine_appointments')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['requested', 'scheduled', 'confirmed'])
          .gte('preferred_date', today)
          .order('preferred_date', { ascending: true })
          .limit(1),
        ...careQueries,
      ])

      const scores = scoresRes.data || []
      setLatestScore(scores[0] || null)
      setPreviousScore(scores[1] || null)
      setReminders(remindersRes.data || [])
      setNextAppointment(appointmentRes.data?.[0] || null)

      const merged = new Map<string, CareLink>()
      careResults.forEach((result: any) => {
        ;(result.data || []).forEach((item: CareLink) => {
          if (item?.id) merged.set(item.id, item)
        })
      })
      setCareLinks(Array.from(merged.values()))
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

  const pendingItems = useMemo<PendingItem[]>(() => {
    const items: PendingItem[] = reminders.slice(0, 3).map((item: any) => ({
      id: `reminder-${item.id}`,
      title: item.title || 'Ação de saúde pendente',
      subtitle: formatDate(item.reminder_date) || undefined,
      href: '/dashboard',
    }))

    if (nextAppointment) {
      items.push({
        id: `appointment-${nextAppointment.id}`,
        title: 'Próxima consulta',
        subtitle: formatDate(nextAppointment.preferred_date) || undefined,
        href: '/telemedicine',
      })
    }

    return items.slice(0, 4)
  }, [reminders, nextAppointment])

  const firstName = user?.user_metadata?.full_name?.split(' ')[0]
    || user?.user_metadata?.name?.split(' ')[0]
    || user?.email?.split('@')[0]
    || 'Olá'

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-emerald-700 via-teal-700 to-cyan-800 p-5 text-white overflow-hidden relative">
        <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10" />
        <div className="relative">
          <div className="flex items-center gap-2 text-sm text-white/80">
            <ShieldCheck className="h-4 w-4" /> HealthWallet Concierge
          </div>
          <h1 className="mt-2 text-2xl font-bold">Olá, {firstName}</h1>
          <p className="mt-1 text-sm text-white/80">
            Sua saúde acompanhada, organizada e coordenada ao longo do tempo.
          </p>

          <Link to="/medscore" className="mt-5 flex items-center justify-between rounded-2xl bg-white/10 p-4 backdrop-blur">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/70">
                <Sparkles className="h-4 w-4" /> MedScore atual
              </div>
              <div className="mt-1 flex items-end gap-2">
                <span className="text-4xl font-bold">{score || '—'}</span>
                {score > 0 && <span className="pb-1 text-sm text-white/70">/100</span>}
              </div>
              {scoreDelta !== 0 && (
                <p className="mt-1 text-xs text-white/80">
                  {scoreDelta > 0 ? '↑' : '↓'} {Math.abs(scoreDelta)} ponto(s) desde a avaliação anterior
                </p>
              )}
            </div>
            <ChevronRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">O que importa agora</h2>
          <Link to="/dashboard" className="text-xs font-semibold text-emerald-700">Ver saúde</Link>
        </div>

        <div className="space-y-2">
          {pendingItems.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm">Nenhuma pendência importante agora</p>
                <p className="text-xs text-muted-foreground mt-1">Sua equipe e o HealthWallet continuarão acompanhando seus próximos passos.</p>
              </div>
            </div>
          ) : pendingItems.map((item) => (
            <Link key={item.id} to={item.href} className="flex items-center gap-3 rounded-2xl border bg-white p-4">
              <CalendarClock className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.title}</p>
                {item.subtitle && <p className="text-xs text-muted-foreground mt-1">{item.subtitle}</p>}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Minha equipe</h2>
          <Link to="/care-links" className="text-xs font-semibold text-emerald-700">Gerenciar</Link>
        </div>

        {careLinks.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white p-5">
            <div className="flex items-center gap-3">
              <Users className="h-6 w-6 text-emerald-700" />
              <div>
                <p className="font-semibold">Sua equipe aparecerá aqui</p>
                <p className="text-xs text-muted-foreground mt-1">No Concierge, você terá profissionais de referência acompanhando sua jornada.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {careLinks.slice(0, 2).map((item) => (
              <div key={item.id} className="rounded-2xl border bg-white p-4 flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Stethoscope className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{item.professional_name || 'Profissional de saúde'}</p>
                  <p className="text-xs text-muted-foreground mt-1">{professionalRole(item)}</p>
                </div>
                <Link to="/chat" className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                  Conversar
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-bold text-gray-900">Como podemos ajudar?</h2>
        <div className="grid grid-cols-2 gap-3">
          <ActionCard icon={MessageCircle} title="Solicitar ajuda" subtitle="Sintoma, dúvida ou orientação" href="/chat" />
          <ActionCard icon={FileUp} title="Enviar exame" subtitle="Organize e compartilhe" href="/upload" />
          <ActionCard icon={HeartPulse} title="Minha saúde" subtitle="Score, histórico e evolução" href="/medscore" />
          <ActionCard icon={Users} title="Minha família" subtitle="Cuide de quem importa" href="/family" />
        </div>
      </section>

      <section className="rounded-2xl border bg-slate-50 p-4">
        <div className="flex gap-3">
          <Activity className="h-5 w-5 text-teal-700 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold">Coordenação contínua, não pronto atendimento</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              O Concierge organiza sua jornada e conecta você à equipe certa. Em situações de emergência, procure imediatamente o serviço de urgência da sua região.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function ActionCard({ icon: Icon, title, subtitle, href }: { icon: any; title: string; subtitle: string; href: string }) {
  return (
    <Link to={href} className="rounded-2xl border bg-white p-4 min-h-[132px] flex flex-col">
      <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-bold text-gray-900">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{subtitle}</p>
    </Link>
  )
}
