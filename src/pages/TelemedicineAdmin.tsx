import { useEffect, useState } from 'react'
import {
  Loader2,
  Video,
  CheckCircle,
  XCircle,
  ExternalLink,
  Clock,
  Bell,
  PlayCircle,
  FileText,
  Send,
  CalendarDays,
  User,
  Mail,
  Stethoscope,
  ReceiptText,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

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

export default function TelemedicineAdmin() {
  const { user } = useAuth()
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [roomLinks, setRoomLinks] = useState<Record<string, string>>({})
  const [scheduleForms, setScheduleForms] = useState<Record<string, any>>({})
  const [postForms, setPostForms] = useState<Record<string, any>>({})

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const { data } = await supabase
      .from('telemedicine_appointments')
      .select('*')
      .order('preferred_date', { ascending: false })
      .order('preferred_time', { ascending: false })
      .order('created_at', { ascending: false })

    const rows = data || []
    setAppointments(rows)

    const nextRoomLinks: Record<string, string> = {}
    const nextScheduleForms: Record<string, any> = {}
    const nextPostForms: Record<string, any> = {}

    rows.forEach((item) => {
      nextRoomLinks[item.id] = item.room_url || item.meet_url || ''
      nextScheduleForms[item.id] = {
        preferred_date: item.preferred_date || '',
        preferred_time: item.preferred_time ? String(item.preferred_time).slice(0, 5) : '',
        duration_minutes: item.duration_minutes || 30,
        professional_name: item.professional_name || '',
        professional_email: item.professional_email || '',
      }
      nextPostForms[item.id] = {
        orientation_text: item.orientation_text || '',
        prescription_text: item.prescription_text || '',
        professional_notes: item.professional_notes || '',
      }
    })

    setRoomLinks(nextRoomLinks)
    setScheduleForms(nextScheduleForms)
    setPostForms(nextPostForms)
    setLoading(false)
  }

  async function logEvent(appointment: any, type: string, description: string, metadata: any = {}) {
    await supabase.from('telemedicine_events').insert({
      appointment_id: appointment.id,
      actor_user_id: user?.id || null,
      patient_id: appointment.patient_id || appointment.user_id || null,
      professional_id: appointment.professional_id || null,
      type,
      description,
      metadata,
    })
  }

  async function scheduleAppointment(item: any) {
    const form = scheduleForms[item.id] || {}
    const roomUrl = roomLinks[item.id]

    if (!form.preferred_date || !form.preferred_time) {
      alert('Informe data e horário da consulta')
      return
    }

    if (!roomUrl) {
      alert('Cole o link da chamada, por exemplo Google Meet')
      return
    }

    setSavingId(item.id)
    const scheduledAt = `${form.preferred_date}T${form.preferred_time}:00-03:00`

    try {
      await supabase
        .from('telemedicine_appointments')
        .update({
          status: 'scheduled',
          preferred_date: form.preferred_date,
          preferred_time: form.preferred_time,
          scheduled_at: scheduledAt,
          duration_minutes: Number(form.duration_minutes || 30),
          professional_name: form.professional_name || item.professional_name || null,
          professional_email: form.professional_email || item.professional_email || null,
          room_url: roomUrl,
          meet_url: roomUrl,
          provider: 'manual_link',
          professional_confirmed: true,
          professional_confirmed_at: new Date().toISOString(),
        })
        .eq('id', item.id)

      await logEvent(item, 'professional_scheduled', 'Profissional agendou a teleconsulta e adicionou o link da sala.', {
        room_url: roomUrl,
        scheduled_at: scheduledAt,
      })

      load()
    } finally {
      setSavingId(null)
    }
  }

  async function markReminderSent(item: any) {
    setSavingId(item.id)

    try {
      await supabase
        .from('telemedicine_appointments')
        .update({
          status: item.status === 'scheduled' ? 'reminder_sent' : item.status,
          reminder_sent_at: new Date().toISOString(),
        })
        .eq('id', item.id)

      await logEvent(item, 'reminder_sent', 'Lembrete de teleconsulta marcado como enviado para o paciente.')
      load()
    } finally {
      setSavingId(null)
    }
  }

  async function startAppointment(item: any) {
    setSavingId(item.id)

    try {
      await supabase
        .from('telemedicine_appointments')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('id', item.id)

      await logEvent(item, 'consultation_started', 'Teleconsulta iniciada pelo profissional.')
      load()
    } finally {
      setSavingId(null)
    }
  }

  async function savePostConsultation(item: any, complete = false) {
    const form = postForms[item.id] || {}
    setSavingId(item.id)

    try {
      await supabase
        .from('telemedicine_appointments')
        .update({
          orientation_text: form.orientation_text || null,
          prescription_text: form.prescription_text || null,
          professional_notes: form.professional_notes || null,
          prescription_sent_at: form.prescription_text ? new Date().toISOString() : item.prescription_sent_at || null,
          status: complete ? 'completed' : item.status,
          completed_at: complete ? new Date().toISOString() : item.completed_at || null,
        })
        .eq('id', item.id)

      await logEvent(
        item,
        complete ? 'consultation_completed' : 'post_consultation_saved',
        complete ? 'Teleconsulta finalizada com orientação/receita.' : 'Orientação/receita da teleconsulta foi salva.',
        {
          has_orientation: !!form.orientation_text,
          has_prescription: !!form.prescription_text,
        }
      )

      load()
    } finally {
      setSavingId(null)
    }
  }

  async function cancelAppointment(item: any) {
    if (!confirm('Cancelar esta consulta?')) return

    setSavingId(item.id)

    try {
      await supabase
        .from('telemedicine_appointments')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', item.id)

      await logEvent(item, 'consultation_cancelled', 'Teleconsulta cancelada pelo profissional/admin.')
      load()
    } finally {
      setSavingId(null)
    }
  }

  async function markNoShow(item: any) {
    if (!confirm('Marcar paciente como ausente?')) return

    setSavingId(item.id)

    try {
      await supabase
        .from('telemedicine_appointments')
        .update({
          status: 'no_show',
          completed_at: new Date().toISOString(),
        })
        .eq('id', item.id)

      await logEvent(item, 'patient_no_show', 'Paciente não compareceu à teleconsulta.')
      load()
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-blue-900 text-white p-5">
        <div className="flex items-center gap-3">
          <Video className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Motor de Teleconsulta</h1>
            <p className="text-white/80 text-sm">
              Agende, confirme, envie lembrete, inicie a chamada e registre receita/orientações.
            </p>
          </div>
        </div>
      </div>

      <section className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900">
        <strong>MVP:</strong> use um link manual do Google Meet, Zoom, Daily ou outro serviço. Na próxima fase, conectamos Google Calendar/Meet automaticamente.
      </section>

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-bold mb-3">Agenda de teleconsultas</h2>

        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
          </div>
        ) : appointments.length > 0 ? (
          <div className="space-y-4">
            {appointments.map((item) => (
              <AppointmentAdminCard
                key={item.id}
                item={item}
                saving={savingId === item.id}
                roomLink={roomLinks[item.id] || ''}
                scheduleForm={scheduleForms[item.id] || {}}
                postForm={postForms[item.id] || {}}
                onRoomLinkChange={(value: string) => setRoomLinks({ ...roomLinks, [item.id]: value })}
                onScheduleChange={(value: any) => setScheduleForms({ ...scheduleForms, [item.id]: { ...(scheduleForms[item.id] || {}), ...value } })}
                onPostChange={(value: any) => setPostForms({ ...postForms, [item.id]: { ...(postForms[item.id] || {}), ...value } })}
                onSchedule={() => scheduleAppointment(item)}
                onReminder={() => markReminderSent(item)}
                onStart={() => startAppointment(item)}
                onSavePost={() => savePostConsultation(item, false)}
                onComplete={() => savePostConsultation(item, true)}
                onCancel={() => cancelAppointment(item)}
                onNoShow={() => markNoShow(item)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Nenhuma consulta encontrada.
          </p>
        )}
      </section>
    </div>
  )
}

function AppointmentAdminCard({
  item,
  saving,
  roomLink,
  scheduleForm,
  postForm,
  onRoomLinkChange,
  onScheduleChange,
  onPostChange,
  onSchedule,
  onReminder,
  onStart,
  onSavePost,
  onComplete,
  onCancel,
  onNoShow,
}: any) {
  const canSchedule = ['requested', 'scheduled', 'confirmed', 'reminder_sent'].includes(item.status)
  const canStart = ['scheduled', 'confirmed', 'reminder_sent'].includes(item.status) && (item.room_url || item.meet_url || roomLink)
  const canPost = ['in_progress', 'confirmed', 'reminder_sent', 'scheduled'].includes(item.status)
  const roomUrl = item.room_url || item.meet_url || roomLink

  return (
    <div className="border rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold">{item.specialty || 'Teleconsulta'}</p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {translateStatus(item.status)}
            </span>
            {item.payment_status && item.payment_status !== 'not_required' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                Pgto: {item.payment_status}
              </span>
            )}
          </div>

          <div className="text-xs text-gray-500 mt-2 space-y-1">
            <InfoLine icon={CalendarDays} text={`${formatDate(item.preferred_date)}${item.preferred_time ? ` às ${String(item.preferred_time).slice(0, 5)}` : ''}`} />
            <InfoLine icon={User} text={item.patient_name || 'Paciente sem nome'} />
            <InfoLine icon={Mail} text={item.patient_email || 'E-mail não informado'} />
            {item.professional_name && <InfoLine icon={Stethoscope} text={`Profissional: ${item.professional_name}`} />}
          </div>
        </div>

        {roomUrl && (
          <a
            href={roomUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"
            title="Abrir sala"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
        )}
      </div>

      {item.reason && (
        <div className="bg-gray-50 border rounded-lg p-3 text-sm text-gray-700">
          <strong>Motivo:</strong> {item.reason}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <StatusBox label="Paciente confirmou" active={!!item.patient_confirmed} />
        <StatusBox label="Dados autorizados" active={!!item.data_sharing_authorized} />
      </div>

      {canSchedule && (
        <section className="rounded-xl border p-3 space-y-3 bg-slate-50">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Agendar / ajustar consulta
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={scheduleForm.preferred_date || ''}
              onChange={(e) => onScheduleChange({ preferred_date: e.target.value })}
              className="px-3 py-2 rounded-lg border bg-background text-sm"
            />
            <input
              type="time"
              value={scheduleForm.preferred_time || ''}
              onChange={(e) => onScheduleChange({ preferred_time: e.target.value })}
              className="px-3 py-2 rounded-lg border bg-background text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              value={scheduleForm.professional_name || ''}
              onChange={(e) => onScheduleChange({ professional_name: e.target.value })}
              placeholder="Nome do profissional"
              className="px-3 py-2 rounded-lg border bg-background text-sm"
            />
            <select
              value={item.specialty || 'Clínica geral'}
              disabled
              className="px-3 py-2 rounded-lg border bg-background text-sm opacity-80"
            >
              {SPECIALTIES.map((specialty) => <option key={specialty}>{specialty}</option>)}
            </select>
          </div>

          <input
            value={roomLink}
            onChange={(e) => onRoomLinkChange(e.target.value)}
            placeholder="Cole aqui o link Google Meet/Zoom/Daily"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />

          <button
            disabled={saving}
            onClick={onSchedule}
            className="w-full py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CheckCircle className="w-4 h-4" />
            Agendar / confirmar com link
          </button>
        </section>
      )}

      <div className="grid grid-cols-2 gap-2">
        <ActionButton disabled={saving || !['scheduled', 'confirmed'].includes(item.status)} onClick={onReminder} icon={Bell} label="Lembrete" />
        <ActionButton disabled={saving || !canStart} onClick={onStart} icon={PlayCircle} label="Iniciar" primary />
      </div>

      {canPost && (
        <section className="rounded-xl border p-3 space-y-3 bg-emerald-50/50">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <ReceiptText className="w-4 h-4" />
            Receita, orientações e notas
          </h3>

          <textarea
            value={postForm.orientation_text || ''}
            onChange={(e) => onPostChange({ orientation_text: e.target.value })}
            placeholder="Orientações ao paciente após a consulta..."
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm min-h-[80px]"
          />

          <textarea
            value={postForm.prescription_text || ''}
            onChange={(e) => onPostChange({ prescription_text: e.target.value })}
            placeholder="Receita / prescrição / recomendações terapêuticas..."
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm min-h-[80px]"
          />

          <textarea
            value={postForm.professional_notes || ''}
            onChange={(e) => onPostChange({ professional_notes: e.target.value })}
            placeholder="Notas internas do profissional..."
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm min-h-[60px]"
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={saving}
              onClick={onSavePost}
              className="py-2 rounded-lg border border-emerald-200 text-emerald-700 bg-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              Salvar
            </button>

            <button
              disabled={saving}
              onClick={onComplete}
              className="py-2 rounded-lg bg-blue-600 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              Finalizar
            </button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={saving || ['completed', 'cancelled', 'no_show'].includes(item.status)}
          onClick={onNoShow}
          className="py-2 rounded-lg border border-yellow-200 text-yellow-700 text-sm font-medium disabled:opacity-40"
        >
          Faltou
        </button>
        <button
          disabled={saving || ['completed', 'cancelled'].includes(item.status)}
          onClick={onCancel}
          className="py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <XCircle className="w-4 h-4" />
          Cancelar
        </button>
      </div>
    </div>
  )
}

function ActionButton({ icon: Icon, label, onClick, disabled, primary }: any) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40 ${primary ? 'bg-cyan-600 text-white' : 'border border-blue-200 text-blue-700 bg-white'}`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

function InfoLine({ icon: Icon, text }: any) {
  return (
    <div className="flex items-center gap-1">
      <Icon className="w-3 h-3" />
      <span>{text}</span>
    </div>
  )
}

function StatusBox({ label, active }: any) {
  return (
    <div className={`rounded-lg border p-2 text-xs ${active ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
      {label}: <strong>{active ? 'OK' : 'pendente'}</strong>
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

function formatDate(date: string) {
  if (!date) return 'Data não informada'
  return new Date(date).toLocaleDateString('pt-BR')
}
