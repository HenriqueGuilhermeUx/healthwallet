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
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

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

export default function Telemedicine() {
  const { user } = useAuth()
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

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
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setAppointments(data || [])
    setLoading(false)
  }

  async function createAppointment() {
    if (!user) return

    if (!form.specialty || !form.preferred_date) {
      alert('Informe especialidade e data desejada')
      return
    }

    const { error } = await supabase.from('telemedicine_appointments').insert({
      user_id: user.id,
      specialty: form.specialty,
      reason: form.reason,
      preferred_date: form.preferred_date,
      preferred_time: form.preferred_time || null,
      status: 'requested',
      provider: 'daily',
    })

    if (error) {
      alert('Erro ao solicitar consulta')
      return
    }

    setForm({
      specialty: 'Clínica geral',
      reason: '',
      preferred_date: '',
      preferred_time: '',
    })

    setShowForm(false)
    load()
  }

  async function cancelAppointment(id: string) {
    if (!confirm('Deseja cancelar esta solicitação?')) return

    await supabase
      .from('telemedicine_appointments')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    load()
  }

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-blue-700 to-cyan-800 text-white p-5">
        <div className="flex items-center gap-3">
          <Video className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Consulta Online</h1>
            <p className="text-white/80 text-sm">
              Solicite teleconsulta e acompanhe seus atendimentos.
            </p>
          </div>
        </div>
      </div>

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
            <label className="text-sm font-medium mb-1 block">
              Especialidade
            </label>
            <select
              value={form.specialty}
              onChange={(e) => setForm({ ...form, specialty: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border bg-background"
            >
              {SPECIALTIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">
                Data desejada
              </label>
              <input
                type="date"
                value={form.preferred_date}
                onChange={(e) => setForm({ ...form, preferred_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border bg-background"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Horário
              </label>
              <input
                type="time"
                value={form.preferred_time}
                onChange={(e) => setForm({ ...form, preferred_time: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border bg-background"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">
              Motivo da consulta
            </label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Ex: revisar exames, colesterol alto, sintomas recentes..."
              className="w-full px-3 py-2 rounded-lg border bg-background min-h-[90px]"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
            MVP inicial: a consulta fica solicitada. Depois conectamos a criação automática de sala Daily pelo backend Render.
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 py-3 rounded-xl border font-medium"
            >
              Cancelar
            </button>

            <button
              onClick={createAppointment}
              className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold"
            >
              Solicitar
            </button>
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-bold mb-3">Minhas consultas</h2>

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
                onCancel={() => cancelAppointment(appointment.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma consulta solicitada ainda.
          </p>
        )}
      </section>
    </div>
  )
}

function AppointmentCard({ appointment, onCancel }: any) {
  const canJoin = appointment.room_url && appointment.status === 'confirmed'
  const cancelled = appointment.status === 'cancelled'

  return (
    <div className={`border rounded-xl p-4 ${cancelled ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
          <Stethoscope className="w-5 h-5 text-blue-600" />
        </div>

        <div className="flex-1">
          <p className="font-semibold">{appointment.specialty}</p>

          <p className="text-xs text-muted-foreground">
            {translateStatus(appointment.status)}
          </p>

          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
            <Calendar className="w-3 h-3" />
            {formatDate(appointment.preferred_date)}
            {appointment.preferred_time ? ` às ${String(appointment.preferred_time).slice(0, 5)}` : ''}
          </div>

          {appointment.reason && (
            <p className="text-sm text-gray-600 mt-2">
              {appointment.reason}
            </p>
          )}

          {canJoin && (
            <a
              href={appointment.room_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium"
            >
              <ExternalLink className="w-4 h-4" />
              Entrar na consulta
            </a>
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

          {appointment.status === 'confirmed' && !canJoin && (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle className="w-4 h-4" />
              Consulta confirmada. Link será liberado em breve.
            </div>
          )}

          {appointment.status === 'requested' && (
            <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-2 flex items-center gap-2 text-sm text-yellow-700">
              <Clock className="w-4 h-4" />
              Aguardando confirmação.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function translateStatus(status: string) {
  const map: Record<string, string> = {
    requested: 'Solicitada',
    confirmed: 'Confirmada',
    completed: 'Concluída',
    cancelled: 'Cancelada',
  }

  return map[status] || status
}

function formatDate(date: string) {
  if (!date) return 'Data não informada'
  return new Date(date).toLocaleDateString('pt-BR')
}
