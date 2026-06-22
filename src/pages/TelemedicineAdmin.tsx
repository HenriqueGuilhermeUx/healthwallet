import { useEffect, useState } from 'react'
import { Loader2, Video, CheckCircle, XCircle, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function TelemedicineAdmin() {
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [roomLinks, setRoomLinks] = useState<Record<string, string>>({})

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const { data } = await supabase
      .from('telemedicine_appointments')
      .select('*')
      .order('created_at', { ascending: false })

    setAppointments(data || [])
    setLoading(false)
  }

  async function confirmAppointment(id: string) {
    const roomUrl = roomLinks[id]

    if (!roomUrl) {
      alert('Informe o link da consulta')
      return
    }

    await supabase
      .from('telemedicine_appointments')
      .update({
        status: 'confirmed',
        room_url: roomUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    load()
  }

  async function cancelAppointment(id: string) {
    if (!confirm('Cancelar esta consulta?')) return

    await supabase
      .from('telemedicine_appointments')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    load()
  }

  async function completeAppointment(id: string) {
    await supabase
      .from('telemedicine_appointments')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    load()
  }

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-blue-900 text-white p-5">
        <div className="flex items-center gap-3">
          <Video className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Admin Telemedicina</h1>
            <p className="text-white/80 text-sm">
              Confirme consultas e adicione o link da sala.
            </p>
          </div>
        </div>
      </div>

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-bold mb-3">Consultas solicitadas</h2>

        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
          </div>
        ) : appointments.length > 0 ? (
          <div className="space-y-3">
            {appointments.map((item) => (
              <div key={item.id} className="border rounded-xl p-4">
                <p className="font-bold">{item.specialty}</p>

                <p className="text-xs text-gray-500 mt-1">
                  Status: {translateStatus(item.status)}
                </p>

                <p className="text-sm text-gray-600 mt-1">
                  Data: {formatDate(item.preferred_date)}
                  {item.preferred_time ? ` às ${String(item.preferred_time).slice(0, 5)}` : ''}
                </p>

                {item.reason && (
                  <p className="text-sm text-gray-700 mt-2">
                    Motivo: {item.reason}
                  </p>
                )}

                {item.room_url && (
                  <a
                    href={item.room_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex items-center gap-2 text-sm text-blue-600"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Abrir sala
                  </a>
                )}

                {item.status === 'requested' && (
                  <div className="mt-4 space-y-2">
                    <input
                      value={roomLinks[item.id] || ''}
                      onChange={(e) =>
                        setRoomLinks({ ...roomLinks, [item.id]: e.target.value })
                      }
                      placeholder="Cole aqui o link Google Meet/Daily"
                      className="w-full px-3 py-2 rounded-lg border bg-background"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => confirmAppointment(item.id)}
                        className="py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Confirmar
                      </button>

                      <button
                        onClick={() => cancelAppointment(item.id)}
                        className="py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium flex items-center justify-center gap-2"
                      >
                        <XCircle className="w-4 h-4" />
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {item.status === 'confirmed' && (
                  <button
                    onClick={() => completeAppointment(item.id)}
                    className="mt-3 w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium"
                  >
                    Marcar como concluída
                  </button>
                )}
              </div>
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
