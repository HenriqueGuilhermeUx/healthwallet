import { useEffect, useState } from 'react'
import {
  Video,
  Plus,
  Clock,
  Calendar,
  Stethoscope,
  Loader2,
  ExternalLink,
  CheckCircle,
  XCircle,
  ShieldCheck,
  FileText,
  Pill,
  Activity,
  QrCode,
  AlertTriangle,
  ClipboardList,
  ReceiptText,
  MessageSquare,
  UserRound,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { createMedicalEvent } from '@/services/medicalTimeline'

const SPECIALTIES = [
  'Clínica geral',
  'Cardiologia',
  'Endocrinologia',
  'Nutrição',
  'Psicologia',
  'Dermatologia',
  'Pediatria',
  'Ginecologia',
]

const DEFAULT_PERMISSIONS = {
  summary: true,
  exams: true,
  medications: true,
  timeline: true,
  passport: true,
  medscore: true,
}

export default function Telemedicine() {
  const { user } = useAuth()
  const [appointments, setAppointments] = useState<any[]>([])
  const [eventsByAppointment, setEventsByAppointment] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    specialty: 'Clínica geral',
    reason: '',
    preferred_date: '',
    preferred_time: '',
  })

  useEffect(() => {
    load()
  }, [user])

  async function load() {
    if (!user) return

    setLoading(true)

    const { data } = await supabase
      .from('telemedicine_appointments')
      .select('*')
      .or(`user_id.eq.${user.id},patient_id.eq.${user.id}`)
      .order('preferred_date', { ascending: false })
      .order('preferred_time', { ascending: false })
      .order('created_at', { ascending: false })

    const rows = data || []
    setAppointments(rows)

    if (rows.length > 0) {
      const ids = rows.map((item) => item.id)
      const { data: events } = await supabase
        .from('telemedicine_events')
        .select('*')
        .in('appointment_id', ids)
        .order('created_at', { ascending: false })

      const grouped: Record<string, any[]> = {}
      ;(events || []).forEach((event) => {
        grouped[event.appointment_id] = grouped[event.appointment_id] || []
        grouped[event.appointment_id].push(event)
      })
      setEventsByAppointment(grouped)
    } else {
      setEventsByAppointment({})
    }

    setLoading(false)
  }

  async function createAppointment() {
    if (!user) return

    if (!form.specialty || !form.preferred_date) {
      alert('Informe especialidade e data desejada')
      return
    }

    const { data, error } = await supabase.from('telemedicine_appointments').insert({
      user_id: user.id,
      patient_id: user.id,
      patient_email: user.email,
      patient_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
      specialty: form.specialty,
      reason: form.reason,
      preferred_date: form.preferred_date,
      preferred_time: form.preferred_time || null,
      duration_minutes: 30,
      status: 'requested',
      provider: 'manual_link',
      shared_data_permissions: DEFAULT_PERMISSIONS,
      payment_status: 'not_required',
    }).select('*').single()

    if (error) {
      alert('Erro ao solicitar consulta. Rode o SQL_TELECONSULTA_MOTOR_V1.sql no Supabase se ainda não rodou.')
      return
    }

    await supabase.from('telemedicine_events').insert({
      appointment_id: data.id,
      actor_user_id: user.id,
      patient_id: user.id,
      type: 'patient_requested',
      description: 'Paciente solicitou uma teleconsulta.',
      metadata: {
        specialty: form.specialty,
        preferred_date: form.preferred_date,
        preferred_time: form.preferred_time,
      },
    })

    await createMedicalEvent({
      userId: user.id,
      type: 'telemedicine',
      title: `Teleconsulta solicitada: ${form.specialty}`,
      description: form.reason || 'Solicitação de consulta online criada pelo paciente.',
      eventDate: form.preferred_date,
    })

    setForm({
      specialty: 'Clínica geral',
      reason: '',
      preferred_date: '',
      preferred_time: '',
    })

    setShowForm(false)
    load()
  }

  async function confirmAppointment(appointment: any) {
    if (!user) return
    setSavingId(appointment.id)

    const now = new Date().toISOString()

    try {
      await supabase
        .from('telemedicine_appointments')
        .update({
          status: ['scheduled', 'reminder_sent'].includes(appointment.status) ? 'confirmed' : appointment.status,
          patient_confirmed: true,
          patient_confirmed_at: now,
          updated_at: now,
        })
        .eq('id', appointment.id)

      await supabase.from('telemedicine_events').insert({
        appointment_id: appointment.id,
        actor_user_id: user.id,
        patient_id: user.id,
        professional_id: appointment.professional_id || null,
        type: 'patient_confirmed',
        description: 'Paciente confirmou presença na teleconsulta.',
      })

      await createMedicalEvent({
        userId: user.id,
        type: 'telemedicine',
        title: `Teleconsulta confirmada: ${appointment.specialty}`,
        description: 'Paciente confirmou presença na consulta online.',
        eventDate: appointment.preferred_date || new Date().toISOString().slice(0, 10),
      })

      load()
    } finally {
      setSavingId(null)
    }
  }

  async function authorizeSharing(appointment: any) {
    if (!user) return
    setSavingId(appointment.id)

    const now = new Date().toISOString()

    try {
      await supabase
        .from('telemedicine_appointments')
        .update({
          data_sharing_authorized: true,
          data_sharing_authorized_at: now,
          shared_data_permissions: appointment.shared_data_permissions || DEFAULT_PERMISSIONS,
          updated_at: now,
        })
        .eq('id', appointment.id)

      await supabase.from('telemedicine_events').insert({
        appointment_id: appointment.id,
        actor_user_id: user.id,
        patient_id: user.id,
        professional_id: appointment.professional_id || null,
        type: 'patient_authorized_sharing',
        description: 'Paciente autorizou compartilhamento de dados para esta teleconsulta.',
        metadata: appointment.shared_data_permissions || DEFAULT_PERMISSIONS,
      })

      load()
    } finally {
      setSavingId(null)
    }
  }

  async function cancelAppointment(id: string) {
    if (!user) return
    if (!confirm('Deseja cancelar esta consulta?')) return

    await supabase
      .from('telemedicine_appointments')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    await supabase.from('telemedicine_events').insert({
      appointment_id: id,
      actor_user_id: user.id,
      patient_id: user.id,
      type: 'patient_cancelled',
      description: 'Paciente cancelou a solicitação de teleconsulta.',
    })

    load()
  }

  const nextActive = appointments.find((item) => !['completed', 'cancelled', 'no_show'].includes(item.status))

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-blue-700 to-cyan-800 text-white p-5 overflow-hidden relative">
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full" />
        <div className="relative flex items-center gap-3">
          <Video className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Teleconsulta</h1>
            <p className="text-white/80 text-sm">
              Confirme, autorize dados e entre na chamada no horário.
            </p>
          </div>
        </div>
      </div>

      {nextActive && (
        <section className="bg-white border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-cyan-600" />
            <h2 className="font-bold">Próxima teleconsulta</h2>
          </div>
          <p className="font-semibold">{nextActive.specialty || 'Consulta online'}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDate(nextActive.preferred_date)} {nextActive.preferred_time ? `às ${String(nextActive.preferred_time).slice(0, 5)}` : ''}
          </p>
          <StatusTimeline appointment={nextActive} />
        </section>
      )}

      <section className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 text-sm text-cyan-900">
        <strong>Fluxo simples:</strong> o profissional agenda, você confirma, autoriza os dados daquela consulta e entra na chamada.
      </section>

      <button
        onClick={() => setShowForm(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold"
      >
        <Plus className="w-5 h-5" />
        Solicitar consulta
      </button>

      {showForm && (
        <section className="bg-white rounded-xl border p-4 space-y-4">
          <h2 className="font-bold">Nova consulta online</h2>

          <div>
            <label className="text-sm font-medium mb-1 block">Especialidade</label>
            <select
              value={form.specialty}
              onChange={(e) => setForm({ ...form, specialty: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border bg-background"
            >
              {SPECIALTIES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Data desejada</label>
              <input
                type="date"
                value={form.preferred_date}
                onChange={(e) => setForm({ ...form, preferred_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border bg-background"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Horário</label>
              <input
                type="time"
                value={form.preferred_time}
                onChange={(e) => setForm({ ...form, preferred_time: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border bg-background"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Motivo da consulta</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Ex: revisar exames, sintomas recentes, acompanhamento..."
              className="w-full px-3 py-2 rounded-lg border bg-background min-h-[90px]"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
            Após o profissional agendar, você poderá confirmar presença e autorizar os dados apenas para aquela consulta.
          </div>

          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl border font-medium">
              Cancelar
            </button>
            <button onClick={createAppointment} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold">
              Solicitar
            </button>
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">Minhas consultas</h2>
          <button onClick={load} className="text-xs text-emerald-700 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            Atualizar
          </button>
        </div>

        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
          </div>
        ) : appointments.length > 0 ? (
          <div className="space-y-3">
            {appointments.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                events={eventsByAppointment[appointment.id] || []}
                saving={savingId === appointment.id}
                onCancel={() => cancelAppointment(appointment.id)}
                onConfirm={() => confirmAppointment(appointment)}
                onAuthorize={() => authorizeSharing(appointment)}
              />
            ))}
          </div>
        ) : (
          <EmptyState onNew={() => setShowForm(true)} />
        )}
      </section>
    </div>
  )
}

function AppointmentCard({ appointment, events, onCancel, onConfirm, onAuthorize, saving }: any) {
  const roomUrl = appointment.room_url || appointment.meet_url
  const canJoin = roomUrl && ['confirmed', 'in_progress', 'scheduled', 'reminder_sent'].includes(appointment.status)
  const cancelled = ['cancelled', 'no_show'].includes(appointment.status)
  const completed = appointment.status === 'completed'
  const needsConfirmation = ['scheduled', 'confirmed', 'reminder_sent'].includes(appointment.status) && !appointment.patient_confirmed
  const needsAuthorization = ['scheduled', 'confirmed', 'in_progress', 'reminder_sent'].includes(appointment.status) && !appointment.data_sharing_authorized

  return (
    <div className={`border rounded-2xl p-4 ${cancelled ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${completed ? 'bg-emerald-100' : 'bg-blue-100'}`}>
          <Stethoscope className={`w-5 h-5 ${completed ? 'text-emerald-600' : 'text-blue-600'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold">{appointment.specialty || 'Teleconsulta'}</p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {translateStatus(appointment.status)}
            </span>
          </div>

          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
            <Calendar className="w-3 h-3" />
            {formatDate(appointment.preferred_date)}
            {appointment.preferred_time ? ` às ${String(appointment.preferred_time).slice(0, 5)}` : ''}
          </div>

          {appointment.professional_name && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <UserRound className="w-3 h-3" />
              Profissional: {appointment.professional_name}
            </div>
          )}

          {appointment.reason && <p className="text-sm text-gray-600 mt-2">{appointment.reason}</p>}

          <StatusTimeline appointment={appointment} />

          <div className="grid grid-cols-2 gap-2 mt-3">
            <StatusPill icon={CheckCircle} active={!!appointment.patient_confirmed} label="Presença" />
            <StatusPill icon={ShieldCheck} active={!!appointment.data_sharing_authorized} label="Dados" />
          </div>

          {needsConfirmation && (
            <button
              disabled={saving}
              onClick={onConfirm}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              Confirmar presença
            </button>
          )}

          {needsAuthorization && (
            <button
              disabled={saving}
              onClick={onAuthorize}
              className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              Autorizar dados desta consulta
            </button>
          )}

          {appointment.data_sharing_authorized && (
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
              <p className="font-semibold mb-2">Dados liberados para este evento:</p>
              <div className="grid grid-cols-2 gap-2">
                <SmallPermission icon={FileText} label="Resumo" />
                <SmallPermission icon={Activity} label="MedScore" />
                <SmallPermission icon={Pill} label="Medicamentos" />
                <SmallPermission icon={QrCode} label="Passport" />
              </div>
            </div>
          )}

          {canJoin && (
            <a
              href={roomUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium"
            >
              <ExternalLink className="w-4 h-4" />
              Entrar na consulta
            </a>
          )}

          {appointment.orientation_text && (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900">
              <div className="flex items-center gap-2 font-semibold mb-1">
                <MessageSquare className="w-4 h-4" />
                Orientações do profissional
              </div>
              <p>{appointment.orientation_text}</p>
            </div>
          )}

          {appointment.prescription_text && (
            <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-900">
              <div className="flex items-center gap-2 font-semibold mb-1">
                <ReceiptText className="w-4 h-4" />
                Receita / prescrição
              </div>
              <p className="whitespace-pre-line">{appointment.prescription_text}</p>
            </div>
          )}

          {events.length > 0 && (
            <div className="mt-3 bg-gray-50 border rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <ClipboardList className="w-3 h-3" />
                Histórico da consulta
              </p>
              <div className="space-y-2">
                {events.slice(0, 4).map((event: any) => (
                  <div key={event.id} className="text-xs text-gray-600">
                    <span className="font-medium">{translateEventType(event.type)}</span>
                    {event.description ? ` — ${event.description}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          {appointment.status === 'requested' && (
            <button
              onClick={onCancel}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium"
            >
              <XCircle className="w-4 h-4" />
              Cancelar solicitação
            </button>
          )}

          {appointment.status === 'requested' && (
            <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-2 flex items-center gap-2 text-sm text-yellow-700">
              <Clock className="w-4 h-4" />
              Aguardando agendamento pelo profissional.
            </div>
          )}

          {['scheduled', 'reminder_sent'].includes(appointment.status) && (
            <div className="mt-3 bg-cyan-50 border border-cyan-200 rounded-lg p-2 flex items-center gap-2 text-sm text-cyan-700">
              <AlertTriangle className="w-4 h-4" />
              Consulta agendada. Confirme presença e autorize os dados.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusTimeline({ appointment }: { appointment: any }) {
  const steps = [
    { key: 'requested', label: 'Solicitada', done: true },
    { key: 'scheduled', label: 'Agendada', done: ['scheduled', 'confirmed', 'reminder_sent', 'in_progress', 'completed'].includes(appointment.status) },
    { key: 'confirmed', label: 'Confirmada', done: !!appointment.patient_confirmed || ['confirmed', 'in_progress', 'completed'].includes(appointment.status) },
    { key: 'sharing', label: 'Dados', done: !!appointment.data_sharing_authorized },
    { key: 'completed', label: 'Finalizada', done: appointment.status === 'completed' },
  ]

  return (
    <div className="mt-3 grid grid-cols-5 gap-1">
      {steps.map((step) => (
        <div key={step.key} className="text-center">
          <div className={`h-1.5 rounded-full mb-1 ${step.done ? 'bg-emerald-500' : 'bg-gray-200'}`} />
          <p className={`text-[10px] ${step.done ? 'text-emerald-700 font-medium' : 'text-gray-400'}`}>{step.label}</p>
        </div>
      ))}
    </div>
  )
}

function StatusPill({ icon: Icon, active, label }: any) {
  return (
    <div className={`rounded-lg border p-2 text-xs flex items-center gap-1 ${active ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
      <Icon className="w-3 h-3" />
      {label}: {active ? 'OK' : 'pendente'}
    </div>
  )
}

function SmallPermission({ icon: Icon, label }: any) {
  return (
    <div className="flex items-center gap-1">
      <Icon className="w-3 h-3" />
      {label}
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="py-8 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-cyan-50 flex items-center justify-center mb-3">
        <Video className="w-7 h-7 text-cyan-600" />
      </div>
      <h3 className="font-bold">Nenhuma teleconsulta ainda</h3>
      <p className="text-sm text-muted-foreground mt-1 mb-4">
        Solicite uma consulta online e compartilhe seus dados com segurança apenas para aquele atendimento.
      </p>
      <button onClick={onNew} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">
        <Plus className="w-4 h-4" />
        Solicitar consulta
      </button>
    </div>
  )
}

function translateStatus(status: string) {
  const map: Record<string, string> = {
    requested: 'Solicitada',
    scheduled: 'Agendada',
    confirmed: 'Confirmada',
    reminder_sent: 'Lembrete enviado',
    in_progress: 'Em andamento',
    completed: 'Concluída',
    cancelled: 'Cancelada',
    no_show: 'Não compareceu',
  }

  return map[status] || status
}

function translateEventType(type: string) {
  const map: Record<string, string> = {
    patient_requested: 'Solicitação',
    professional_scheduled: 'Agendamento',
    patient_confirmed: 'Confirmação',
    patient_authorized_sharing: 'Dados autorizados',
    reminder_sent: 'Lembrete',
    consultation_started: 'Início',
    consultation_completed: 'Finalização',
    post_consultation_saved: 'Orientação salva',
    patient_cancelled: 'Cancelamento',
    consultation_cancelled: 'Cancelamento',
    patient_no_show: 'Ausência',
  }

  return map[type] || type
}

function formatDate(date: string) {
  if (!date) return 'Data não informada'
  return new Date(date).toLocaleDateString('pt-BR')
}
