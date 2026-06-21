import { useEffect, useState } from 'react'
import {
  Calendar,
  Plus,
  Stethoscope,
  FileText,
  Pill,
  CheckCircle,
  Clock,
  Bell,
  Trash2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { createMedicalEvent } from '@/services/medicalTimeline'

const EVENT_TYPES = [
  { value: 'consultation', label: 'Consulta', icon: Stethoscope },
  { value: 'exam', label: 'Exame realizado', icon: FileText },
  { value: 'future_exam', label: 'Exame futuro', icon: Calendar },
  { value: 'return', label: 'Retorno médico', icon: Clock },
  { value: 'medication', label: 'Medicamento', icon: Pill },
  { value: 'checklist', label: 'Checklist diário', icon: CheckCircle },
]

const FREQUENCIES = [
  { value: 'once', label: 'Uma vez' },
  { value: 'daily', label: 'Diário' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
]

export default function Timeline() {
  const { user } = useAuth()
  const [events, setEvents] = useState<any[]>([])
  const [medications, setMedications] = useState<any[]>([])
  const [reminders, setReminders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

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

    const [eventsRes, medsRes, remindersRes] = await Promise.all([
      supabase
        .from('medical_events')
        .select('*')
        .eq('user_id', user.id)
        .order('event_date', { ascending: false }),

      supabase
        .from('medications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),

      supabase
        .from('health_reminders')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('reminder_date', { ascending: true })
        .order('reminder_time', { ascending: true }),
    ])

    setEvents(eventsRes.data || [])
    setMedications(medsRes.data || [])
    setReminders(remindersRes.data || [])
    setLoading(false)
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

    setForm({
      type: 'consultation',
      title: '',
      description: '',
      event_date: '',
      reminder_time: '',
      frequency: 'once',
      create_reminder: true,
    })

    setShowForm(false)
    load()
  }

  async function toggleReminderDone(reminder: any) {
    await supabase
      .from('health_reminders')
      .update({ is_done: !reminder.is_done })
      .eq('id', reminder.id)

    load()
  }

  async function deleteReminder(id: string) {
    if (!confirm('Deseja excluir este lembrete?')) return

    await supabase
      .from('health_reminders')
      .update({
        is_active: false,
      })
      .eq('id', id)

    load()
  }

  const today = new Date().toISOString().slice(0, 10)

  const upcoming = events.filter((event) => event.event_date >= today)
  const past = events.filter((event) => event.event_date < today)

  const todayReminders = reminders.filter((reminder) => {
    if (!reminder.reminder_date) return false
    return reminder.reminder_date === today
  })

  const futureReminders = reminders.filter((reminder) => {
    if (!reminder.reminder_date) return false
    return reminder.reminder_date > today
  })

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white p-5">
        <div className="flex items-center gap-3">
          <Calendar className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Agenda de Saúde</h1>
            <p className="text-white/80 text-sm">
              Consultas, exames, retornos, medicamentos e lembretes.
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={() => setShowForm(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold"
      >
        <Plus className="w-5 h-5" />
        Adicionar lembrete ou evento
      </button>

      {showForm && (
        <div className="bg-white rounded-xl border p-4 space-y-4">
          <h2 className="font-bold">Novo lembrete de saúde</h2>

          <div>
            <label className="text-sm font-medium mb-1 block">Tipo</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background"
            >
              {EVENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Título</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex: Consulta cardiologista"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Data</label>
              <input
                type="date"
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Horário</label>
              <input
                type="time"
                value={form.reminder_time}
                onChange={(e) => setForm({ ...form, reminder_time: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Frequência</label>
            <select
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background"
            >
              {FREQUENCIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Observação</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ex: levar exames, tomar em jejum, retorno em 30 dias..."
              className="w-full px-3 py-2 rounded-lg border border-border bg-background min-h-[90px]"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.create_reminder}
              onChange={(e) => setForm({ ...form, create_reminder: e.target.checked })}
            />
            Criar lembrete automático
          </label>

          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 py-3 rounded-xl border border-border font-medium"
            >
              Cancelar
            </button>

            <button
              onClick={saveEvent}
              className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold"
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      <section className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-5 h-5 text-emerald-600" />
          <h2 className="font-bold text-emerald-900">Lembretes de hoje</h2>
        </div>

        {loading ? (
          <p className="text-sm text-emerald-700">Carregando...</p>
        ) : todayReminders.length > 0 ? (
          <div className="space-y-3">
            {todayReminders.map((reminder) => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                onToggle={() => toggleReminderDone(reminder)}
                onDelete={() => deleteReminder(reminder.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-emerald-700">
            Nenhum lembrete para hoje.
          </p>
        )}
      </section>

      <section className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-5 h-5 text-blue-600" />
          <h2 className="font-bold text-blue-900">Próximos avisos</h2>
        </div>

        {loading ? (
          <p className="text-sm text-blue-700">Carregando...</p>
        ) : upcoming.length > 0 || futureReminders.length > 0 ? (
          <div className="space-y-3">
            {futureReminders.slice(0, 3).map((reminder) => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                onToggle={() => toggleReminderDone(reminder)}
                onDelete={() => deleteReminder(reminder.id)}
              />
            ))}

            {upcoming.slice(0, 5).map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-blue-700">
            Nenhum compromisso futuro cadastrado.
          </p>
        )}
      </section>

      <section className="bg-orange-50 border border-orange-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Pill className="w-5 h-5 text-orange-600" />
          <h2 className="font-bold text-orange-900">Tratamentos ativos</h2>
        </div>

        {loading ? (
          <p className="text-sm text-orange-700">Carregando...</p>
        ) : medications.length > 0 ? (
          <div className="space-y-3">
            {medications.map((med) => (
              <MedicationReminder key={med.id} med={med} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-orange-700">
            Nenhum medicamento ativo cadastrado.
          </p>
        )}
      </section>

      <section className="bg-white rounded-xl border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-5 h-5 text-emerald-600" />
          <h2 className="font-bold">Histórico clínico</h2>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Carregando...</p>
        ) : past.length > 0 ? (
          <div className="space-y-4">
            {past.map((event) => (
              <TimelineItem key={event.id} event={event} />
            ))}
          </div>
        ) : events.length > 0 ? (
          <div className="space-y-4">
            {events.map((event) => (
              <TimelineItem key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Nenhum evento registrado ainda.
          </p>
        )}
      </section>
    </div>
  )
}

function ReminderCard({ reminder, onToggle, onDelete }: any) {
  const meta = getEventMeta(reminder.type)

  return (
    <div className={`bg-white border rounded-xl p-3 ${reminder.is_done ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            reminder.is_done ? 'bg-emerald-100' : 'bg-gray-100'
          }`}
        >
          <CheckCircle className={`w-5 h-5 ${reminder.is_done ? 'text-emerald-600' : 'text-gray-400'}`} />
        </button>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <meta.icon className="w-4 h-4 text-emerald-600" />
            <p className="font-semibold text-sm line-clamp-1">
              {reminder.title}
            </p>
          </div>

          <p className="text-xs text-gray-500">
            {meta.label} · {formatDate(reminder.reminder_date)}
            {reminder.reminder_time ? ` às ${String(reminder.reminder_time).slice(0, 5)}` : ''}
          </p>

          <p className="text-xs text-gray-500">
            Frequência: {translateFrequency(reminder.frequency)}
          </p>

          {reminder.description && (
            <p className="text-xs text-gray-600 mt-1">
              {reminder.description}
            </p>
          )}
        </div>

        <button
          onClick={onDelete}
          className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function MedicationReminder({ med }: any) {
  return (
    <div className="bg-white border border-orange-100 rounded-xl p-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center">
          <Pill className="w-5 h-5 text-orange-600" />
        </div>

        <div className="flex-1">
          <p className="font-semibold text-sm">
            {med.name || med.medication_name || 'Medicamento'}
          </p>

          <p className="text-xs text-gray-500">
            {[med.dosage, med.frequency].filter(Boolean).join(' · ') || 'Sem detalhes'}
          </p>

          {med.reminder_time && (
            <p className="text-xs text-orange-700 mt-1 flex items-center gap-1">
              <Bell className="w-3 h-3" />
              Lembrete às {String(med.reminder_time).slice(0, 5)}
            </p>
          )}

          {(med.start_date || med.end_date) && (
            <p className="text-xs text-gray-500 mt-1">
              {med.start_date ? `Início: ${formatDate(med.start_date)}` : ''}
              {med.end_date ? ` · até ${formatDate(med.end_date)}` : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function EventCard({ event }: any) {
  const meta = getEventMeta(event.type)

  return (
    <div className="bg-white border border-blue-100 rounded-xl p-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
          <meta.icon className="w-5 h-5 text-blue-600" />
        </div>

        <div className="flex-1">
          <p className="font-semibold text-sm">{event.title}</p>
          <p className="text-xs text-gray-500">
            {meta.label} · {formatDate(event.event_date)}
          </p>

          {event.description && (
            <p className="text-xs text-gray-600 mt-1">
              {event.description}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function TimelineItem({ event }: any) {
  const meta = getEventMeta(event.type)

  return (
    <div className="border-l-4 border-emerald-500 pl-4">
      <div className="flex items-center gap-2 mb-1">
        <meta.icon className="w-4 h-4 text-emerald-600" />
        <span className="text-xs text-emerald-700 font-medium">
          {meta.label}
        </span>
      </div>

      <h3 className="font-bold text-sm">{event.title}</h3>

      {event.description && (
        <p className="text-sm text-gray-600 mt-1">
          {event.description}
        </p>
      )}

      <p className="text-xs text-gray-400 mt-1">
        {formatDate(event.event_date)}
      </p>
    </div>
  )
}

function getEventMeta(type: string) {
  const found = EVENT_TYPES.find((item) => item.value === type)

  return found || {
    value: 'event',
    label: 'Evento',
    icon: Calendar,
  }
}

function translateFrequency(value: string) {
  const map: Record<string, string> = {
    once: 'Uma vez',
    daily: 'Diário',
    weekly: 'Semanal',
    monthly: 'Mensal',
  }

  return map[value] || value || 'Uma vez'
}

function formatDate(date: string) {
  if (!date) return 'Data não informada'
  return new Date(date).toLocaleDateString('pt-BR')
}
