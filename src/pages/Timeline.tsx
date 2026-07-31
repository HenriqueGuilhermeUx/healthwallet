import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Pill,
  Plus,
  Stethoscope,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { createMedicalEvent } from '@/services/medicalTimeline'

const EVENT_TYPES = [
  { value: 'consultation', label: 'Consulta', icon: Stethoscope, group: 'consultations' },
  { value: 'exam', label: 'Exame realizado', icon: FileText, group: 'exams' },
  { value: 'future_exam', label: 'Exame futuro', icon: Calendar, group: 'exams' },
  { value: 'return', label: 'Retorno médico', icon: Clock, group: 'returns' },
  { value: 'medication', label: 'Medicamento', icon: Pill, group: 'medications' },
  { value: 'medication_confirmation', label: 'Confirmação de medicamento', icon: CheckCircle, group: 'medications' },
  { value: 'medication_repurchase', label: 'Reposição de medicamento', icon: Pill, group: 'medications' },
  { value: 'checklist', label: 'Checklist diário', icon: CheckCircle, group: 'all' },
]

const FREQUENCIES = [
  { value: 'once', label: 'Uma vez' },
  { value: 'daily', label: 'Diário' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
]

const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'consultations', label: 'Consultas' },
  { value: 'exams', label: 'Exames' },
  { value: 'medications', label: 'Remédios' },
  { value: 'returns', label: 'Retornos' },
]

type FeedItem = {
  id: string
  kind: 'reminder' | 'event' | 'medication'
  group: string
  date: string
  time?: string | null
  title: string
  subtitle: string
  description?: string
  raw: any
}

export default function Timeline() {
  const { user } = useAuth()
  const [events, setEvents] = useState<any[]>([])
  const [medications, setMedications] = useState<any[]>([])
  const [reminders, setReminders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [activeFilter, setActiveFilter] = useState('all')

  const [form, setForm] = useState({
    type: 'consultation',
    title: '',
    description: '',
    event_date: '',
    reminder_time: '',
    frequency: 'once',
    create_reminder: true,
  })

  useEffect(() => {
    load()
  }, [user])

  async function load() {
    if (!user) return

    setLoading(true)

    try {
      const [eventsRes, medsRes, remindersRes] = await Promise.all([
        supabase.from('medical_events').select('*').eq('user_id', user.id).order('event_date', { ascending: false }),
        supabase.from('medications').select('*').eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('health_reminders').select('*').eq('user_id', user.id).eq('is_active', true).order('reminder_date', { ascending: true }).order('reminder_time', { ascending: true }),
      ])

      setEvents(eventsRes.data || [])
      setMedications(medsRes.data || [])
      setReminders(remindersRes.data || [])
    } catch (error) {
      console.error('Error loading agenda:', error)
    } finally {
      setLoading(false)
    }
  }

  async function saveEvent() {
    if (!user || !form.title.trim()) {
      alert('Informe um título')
      return
    }

    const eventDate = form.event_date || new Date().toISOString().slice(0, 10)

    await createMedicalEvent({
      userId: user.id,
      type: form.type,
      title: form.title,
      description: form.description,
      eventDate,
    })

    if (form.create_reminder) {
      await supabase.from('health_reminders').insert({
        user_id: user.id,
        type: form.type,
        title: form.title,
        description: form.description || '',
        reminder_date: eventDate,
        reminder_time: form.reminder_time || null,
        frequency: form.frequency,
        is_done: false,
        is_active: true,
      })
    }

    setForm({ type: 'consultation', title: '', description: '', event_date: '', reminder_time: '', frequency: 'once', create_reminder: true })
    setShowForm(false)
    load()
  }

  async function toggleReminderDone(reminder: any) {
    await supabase.from('health_reminders').update({ is_done: !reminder.is_done }).eq('id', reminder.id)
    load()
  }

  async function deleteReminder(id: string) {
    if (!confirm('Deseja excluir este lembrete?')) return
    await supabase.from('health_reminders').update({ is_active: false }).eq('id', id)
    load()
  }

  const today = new Date().toISOString().slice(0, 10)
  const todayItems = useMemo(() => buildFeedItems(events, reminders, medications).filter((item) => item.date === today), [events, reminders, medications])
  const futureItems = useMemo(() => buildFeedItems(events, reminders, medications).filter((item) => item.date > today), [events, reminders, medications])
  const historyItems = useMemo(() => buildFeedItems(events, reminders, medications).filter((item) => item.date < today), [events, reminders, medications])

  const filteredToday = filterItems(todayItems, activeFilter)
  const filteredFuture = filterItems(futureItems, activeFilter)
  const filteredHistory = filterItems(historyItems, activeFilter)
  const lowStockMeds = medications.filter((med) => isLowStock(med))

  return (
    <div className="space-y-5 pb-28">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 p-5 text-white">
        <div className="flex items-center gap-3">
          <Calendar className="h-8 w-8" />
          <div>
            <h1 className="text-2xl font-bold">Agenda de Saúde</h1>
            <p className="text-sm text-white/80">Visão única para consultas, exames, remédios, retornos e lembretes.</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setActiveFilter(filter.value)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${activeFilter === filter.value ? 'bg-emerald-600 text-white' : 'bg-white border text-muted-foreground'}`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <button onClick={() => setShowForm(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white">
        <Plus className="h-5 w-5" /> Adicionar lembrete ou evento
      </button>

      {showForm && (
        <div className="rounded-xl border bg-white p-4 space-y-4">
          <h2 className="font-bold">Novo lembrete de saúde</h2>
          <Select label="Tipo" value={form.type} onChange={(value: string) => setForm({ ...form, type: value })} options={EVENT_TYPES.map((type) => [type.value, type.label])} />
          <Input label="Título" value={form.title} onChange={(value: string) => setForm({ ...form, title: value })} placeholder="Ex: Consulta cardiologista" />

          <div className="grid grid-cols-2 gap-3">
            <DateInput label="Data" value={form.event_date} onChange={(value: string) => setForm({ ...form, event_date: value })} />
            <TimeInput label="Horário" value={form.reminder_time} onChange={(value: string) => setForm({ ...form, reminder_time: value })} />
          </div>

          <Select label="Frequência" value={form.frequency} onChange={(value: string) => setForm({ ...form, frequency: value })} options={FREQUENCIES.map((item) => [item.value, item.label])} />
          <TextArea label="Observação" value={form.description} onChange={(value: string) => setForm({ ...form, description: value })} placeholder="Ex: levar exames, tomar em jejum, retorno em 30 dias..." />

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.create_reminder} onChange={(e) => setForm({ ...form, create_reminder: e.target.checked })} />
            Criar lembrete automático
          </label>

          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 rounded-xl border py-3 font-medium">Cancelar</button>
            <button onClick={saveEvent} className="flex-1 rounded-xl bg-emerald-600 py-3 font-semibold text-white">Salvar</button>
          </div>
        </div>
      )}

      {lowStockMeds.length > 0 && (activeFilter === 'all' || activeFilter === 'medications') && (
        <section className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
          <div className="flex items-start gap-3">
            <Pill className="mt-0.5 h-5 w-5 text-orange-700" />
            <div className="flex-1">
              <p className="font-bold">Reposição em atenção</p>
              <p>{lowStockMeds.length} medicamento(s) com estoque baixo. Reposição só aparece quando você cadastrou o remédio e o estoque está perto de acabar.</p>
            </div>
          </div>
          <Link to="/medications" className="mt-3 block rounded-xl bg-orange-600 py-3 text-center font-semibold text-white">Abrir medicamentos</Link>
        </section>
      )}

      <AgendaSection title="Hoje" tone="emerald" items={filteredToday} loading={loading} empty="Nada para hoje neste filtro." onToggle={toggleReminderDone} onDelete={deleteReminder} />
      <AgendaSection title="Próximos" tone="blue" items={filteredFuture.slice(0, 10)} loading={loading} empty="Nenhum compromisso futuro neste filtro." onToggle={toggleReminderDone} onDelete={deleteReminder} />
      <AgendaSection title="Histórico" tone="gray" items={filteredHistory.slice(0, 12)} loading={loading} empty="Nenhum histórico neste filtro." onToggle={toggleReminderDone} onDelete={deleteReminder} />
    </div>
  )
}

function buildFeedItems(events: any[], reminders: any[], medications: any[]): FeedItem[] {
  const today = new Date().toISOString().slice(0, 10)
  const reminderItems: FeedItem[] = reminders.map((reminder) => {
    const meta = getEventMeta(reminder.type)
    return {
      id: `reminder-${reminder.id}`,
      kind: 'reminder',
      group: meta.group,
      date: reminder.reminder_date || today,
      time: reminder.reminder_time || null,
      title: reminder.title,
      subtitle: `${meta.label}${reminder.reminder_time ? ` às ${String(reminder.reminder_time).slice(0, 5)}` : ''}`,
      description: reminder.description,
      raw: reminder,
    }
  })

  const eventItems: FeedItem[] = events.map((event) => {
    const meta = getEventMeta(event.type)
    return {
      id: `event-${event.id}`,
      kind: 'event',
      group: meta.group,
      date: event.event_date || today,
      time: null,
      title: event.title,
      subtitle: meta.label,
      description: event.description,
      raw: event,
    }
  })

  const medicationItems: FeedItem[] = medications.map((med) => ({
    id: `medication-${med.id}`,
    kind: 'medication',
    group: 'medications',
    date: today,
    time: med.reminder_time || null,
    title: med.name || med.medication_name || 'Medicamento',
    subtitle: med.reminder_time ? `Lembrete às ${String(med.reminder_time).slice(0, 5)}` : 'Tratamento ativo',
    description: [med.dosage, med.frequency, stockLabel(med)].filter(Boolean).join(' · '),
    raw: med,
  }))

  return [...reminderItems, ...medicationItems, ...eventItems].sort((a, b) => `${a.date} ${a.time || '99:99'}`.localeCompare(`${b.date} ${b.time || '99:99'}`))
}

function filterItems(items: FeedItem[], filter: string) {
  if (filter === 'all') return items
  return items.filter((item) => item.group === filter)
}

function AgendaSection({ title, tone, items, loading, empty, onToggle, onDelete }: any) {
  const toneClass = tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : tone === 'blue' ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-900'
  return (
    <section className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-5 w-5" />
        <h2 className="font-bold">{title}</h2>
      </div>
      {loading ? (
        <p className="text-sm opacity-75">Carregando...</p>
      ) : items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item: FeedItem) => <AgendaItem key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} />)}
        </div>
      ) : (
        <p className="text-sm opacity-75">{empty}</p>
      )}
    </section>
  )
}

function AgendaItem({ item, onToggle, onDelete }: any) {
  const meta = item.kind === 'medication' ? getEventMeta('medication') : getEventMeta(item.raw.type)
  const Icon = meta.icon
  const isReminder = item.kind === 'reminder'
  const isDone = Boolean(item.raw.is_done)

  return (
    <div className={`rounded-xl border bg-white p-3 text-gray-900 ${isDone ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${item.group === 'medications' ? 'bg-orange-100' : item.group === 'exams' ? 'bg-blue-100' : 'bg-emerald-100'}`}>
          <Icon className={`h-5 w-5 ${item.group === 'medications' ? 'text-orange-600' : item.group === 'exams' ? 'text-blue-600' : 'text-emerald-600'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-sm line-clamp-1">{item.title}</p>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{meta.label}</span>
          </div>
          <p className="text-xs text-gray-500">{formatDate(item.date)}{item.time ? ` às ${String(item.time).slice(0, 5)}` : ''}</p>
          {item.description && <p className="mt-1 text-xs text-gray-600">{item.description}</p>}
          {item.kind === 'medication' && <Link to="/medications" className="mt-2 inline-block text-xs font-semibold text-orange-700">Gerenciar medicamento</Link>}
        </div>
        {isReminder && (
          <div className="flex flex-col gap-2">
            <button onClick={() => onToggle(item.raw)} className="rounded-lg bg-gray-100 p-2 text-gray-500">
              <CheckCircle className={`h-4 w-4 ${isDone ? 'text-emerald-600' : ''}`} />
            </button>
            <button onClick={() => onDelete(item.raw.id)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
          </div>
        )}
      </div>
    </div>
  )
}

function getEventMeta(type: string) {
  const found = EVENT_TYPES.find((item) => item.value === type)
  return found || { value: 'event', label: 'Evento', icon: Calendar, group: 'all' }
}

function stockLabel(med: any) {
  const days = calculateStockDays(med.stock_quantity, med.pills_per_day)
  if (typeof days !== 'number') return ''
  return `Estoque estimado: ${days} dia(s)${isLowStock(med) ? ' · recomprar em breve' : ''}`
}

function calculateStockDays(stock: any, pillsPerDay: any) {
  const s = Number(stock)
  const p = Number(pillsPerDay)
  if (!Number.isFinite(s) || !Number.isFinite(p) || p <= 0) return null
  return Math.ceil(s / p)
}

function isLowStock(med: any) {
  const stockDays = calculateStockDays(med.stock_quantity, med.pills_per_day)
  if (typeof stockDays !== 'number') return false
  return stockDays <= Number(med.stock_alert_threshold || 5)
}

function Select({ label, value, onChange, options }: any) {
  return <div><label className="mb-1 block text-sm font-medium">{label}</label><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2">{options.map(([v, l]: any[]) => <option key={v} value={v}>{l}</option>)}</select></div>
}

function Input({ label, value, onChange, placeholder = '' }: any) {
  return <div><label className="mb-1 block text-sm font-medium">{label}</label><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border bg-background px-3 py-2" /></div>
}

function DateInput({ label, value, onChange }: any) {
  return <div><label className="mb-1 block text-sm font-medium">{label}</label><input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2" /></div>
}

function TimeInput({ label, value, onChange }: any) {
  return <div><label className="mb-1 block text-sm font-medium">{label}</label><input type="time" value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2" /></div>
}

function TextArea({ label, value, onChange, placeholder = '' }: any) {
  return <div><label className="mb-1 block text-sm font-medium">{label}</label><textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-[90px] w-full rounded-lg border bg-background px-3 py-2" /></div>
}

function formatDate(date: string) {
  if (!date) return 'Data não informada'
  return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR')
}
