import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Bell, CalendarCheck, CalendarDays, CheckCircle2, Clock, Loader2, Target, Video } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

type AgendaItem = {
  id: string
  date: string
  time?: string | null
  type: 'action' | 'appointment' | 'reminder' | 'coordination'
  title: string
  subtitle?: string
  href: string
  overdue?: boolean
}

function dateKey(value?: string | null) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}

function typeIcon(type: AgendaItem['type']) {
  if (type === 'appointment') return Video
  if (type === 'coordination') return CalendarCheck
  if (type === 'reminder') return Bell
  return Target
}

export default function ConciergeAgenda() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AgendaItem[]>([])
  const [coordinations, setCoordinations] = useState<any[]>([])
  const [choiceOptions, setChoiceOptions] = useState<any[]>([])
  const [choiceBusy, setChoiceBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    void load()
  }, [user?.id])

  async function load() {
    if (!user) return
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)

    try {
      const [actionsRes, appointmentsRes, remindersRes, coordinatedRes] = await Promise.all([
        supabase
          .from('concierge_actions')
          .select('*')
          .eq('patient_id', user.id)
          .in('status', ['pending', 'in_progress'])
          .not('due_date', 'is', null)
          .order('due_date', { ascending: true })
          .limit(50),
        supabase
          .from('telemedicine_appointments')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['requested', 'scheduled', 'confirmed'])
          .gte('preferred_date', today)
          .order('preferred_date', { ascending: true })
          .limit(30),
        supabase
          .from('health_reminders')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .gte('reminder_date', today)
          .order('reminder_date', { ascending: true })
          .limit(30),
        supabase.rpc('concierge_patient_list_external_tasks'),
      ])

      const coordinationRows = coordinatedRes.data || []
      setCoordinations(coordinationRows)

      const choiceTask = coordinationRows.find((task: any) => task.status === 'awaiting_patient_choice')
      if (choiceTask) {
        const { data: optionData, error: optionError } = await supabase.rpc('concierge_patient_list_external_options', {
          p_task_id: choiceTask.id,
        })
        if (optionError) throw optionError
        setChoiceOptions(optionData || [])
      } else {
        setChoiceOptions([])
      }

      const agenda: AgendaItem[] = []

      ;(actionsRes.data || []).forEach((action: any) => agenda.push({
        id: `action-${action.id}`,
        date: dateKey(action.due_date),
        type: 'action',
        title: action.title,
        subtitle: action.description || 'Plano de ação Concierge',
        href: '/concierge/plan',
        overdue: dateKey(action.due_date) < today,
      }))

      ;(appointmentsRes.data || []).forEach((appointment: any) => agenda.push({
        id: `appointment-${appointment.id}`,
        date: dateKey(appointment.preferred_date || appointment.scheduled_at),
        time: appointment.preferred_time || (appointment.scheduled_at ? new Date(appointment.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null),
        type: 'appointment',
        title: appointment.specialty || 'Consulta',
        subtitle: appointment.professional_name || appointment.clinic_name || 'Atendimento agendado',
        href: '/telemedicine',
      }))

      ;(remindersRes.data || []).forEach((reminder: any) => agenda.push({
        id: `reminder-${reminder.id}`,
        date: dateKey(reminder.reminder_date),
        time: reminder.reminder_time,
        type: 'reminder',
        title: reminder.title || 'Lembrete de saúde',
        subtitle: reminder.description || undefined,
        href: '/dashboard',
      }))

      ;(coordinatedRes.data || [])
        .filter((task: any) => ['booked', 'instructions_sent'].includes(task.status) && task.scheduled_at && dateKey(task.scheduled_at) >= today)
        .forEach((task: any) => agenda.push({
          id: `coordination-${task.id}`,
          date: dateKey(task.scheduled_at),
          time: task.scheduled_at ? new Date(task.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null,
          type: 'coordination',
          title: task.title,
          subtitle: task.provider_name || 'Agendamento coordenado pelo Concierge',
          href: '/concierge/agenda',
        }))

      agenda.sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`))
      setItems(agenda)
    } catch (error) {
      console.warn('Concierge agenda unavailable:', error)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const activeCoordinations = useMemo(
    () => coordinations.filter((task) => !['closed', 'cancelled'].includes(task.status)),
    [coordinations],
  )

  const choiceTask = useMemo(
    () => coordinations.find((task) => task.status === 'awaiting_patient_choice') || null,
    [coordinations],
  )

  async function chooseCoordinationOption(option: any) {
    if (!choiceTask) return
    if (!confirm('Escolher ' + option.provider_name + ' para o Concierge seguir com o agendamento?')) return

    setChoiceBusy(option.id)
    try {
      const { error } = await supabase.rpc('concierge_patient_select_external_option', {
        p_task_id: choiceTask.id,
        p_option_id: option.id,
      })
      if (error) throw error

      toast.success('Opção escolhida. O Concierge seguirá com o agendamento.')
      await load()
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível registrar sua escolha.')
    } finally {
      setChoiceBusy(null)
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, AgendaItem[]>()
    items.forEach((item) => map.set(item.date, [...(map.get(item.date) || []), item]))
    return Array.from(map.entries())
  }, [items])

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-blue-900 via-teal-900 to-emerald-700 p-5 text-white">
        <button type="button" onClick={() => navigate('/concierge')} className="mb-4 flex items-center gap-2 text-sm text-white/75"><ArrowLeft className="h-4 w-4" /> Concierge</button>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/65"><CalendarDays className="h-4 w-4" /> Jornada coordenada</div>
        <h1 className="mt-2 text-2xl font-bold">Minha Agenda</h1>
        <p className="mt-2 text-sm text-white/80">Consultas, lembretes e próximos passos reunidos sem duplicar o que já existe na HealthWallet.</p>
      </section>

      {choiceTask && choiceOptions.length > 0 && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-emerald-700" />
            <h2 className="font-bold text-emerald-950">Escolha uma opção</h2>
          </div>
          <p className="mt-2 text-sm text-emerald-900">{choiceTask.title}</p>
          <div className="mt-3 space-y-2">
            {choiceOptions.map((option: any) => (
              <button
                key={option.id}
                type="button"
                disabled={choiceBusy === option.id}
                onClick={() => chooseCoordinationOption(option)}
                className="w-full rounded-xl border bg-white p-3 text-left disabled:opacity-50"
              >
                <p className="text-sm font-bold text-gray-900">{option.provider_name}</p>
                {option.address && <p className="mt-1 text-xs text-gray-600">{option.address}</p>}
                {option.price_amount != null && <p className="mt-1 text-xs font-semibold text-emerald-700">{Number(option.price_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>}
                <p className="mt-2 text-xs font-bold text-emerald-700">{choiceBusy === option.id ? 'Registrando...' : 'Escolher esta opção'}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {groups.length === 0 ? (
        <section className="rounded-2xl border border-dashed bg-white p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="mt-3 font-semibold">Nenhum compromisso pendente</p>
          <p className="mt-1 text-sm text-muted-foreground">Novas ações e consultas aparecerão aqui conforme sua jornada for sendo coordenada.</p>
        </section>
      ) : groups.map(([date, dayItems]) => (
        <section key={date}>
          <h2 className="mb-2 text-sm font-bold capitalize text-slate-700">{formatDate(date)}</h2>
          <div className="space-y-2">
            {dayItems.map((item) => {
              const Icon = typeIcon(item.type)
              return (
                <Link key={item.id} to={item.href} className={`block rounded-2xl border p-4 ${item.overdue ? 'border-amber-200 bg-amber-50' : 'bg-white'}`}>
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center"><Icon className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><p className="font-semibold">{item.title}</p>{item.overdue && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">VENCIDA</span>}</div>
                      {item.subtitle && <p className="mt-1 text-xs text-muted-foreground">{item.subtitle}</p>}
                      {item.time && <p className="mt-2 flex items-center gap-1 text-xs font-medium text-slate-600"><Clock className="h-3.5 w-3.5" /> {String(item.time).slice(0, 5)}</p>}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
