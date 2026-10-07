import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarCheck, CheckCircle2, Clock3, ExternalLink, Loader2, MapPin, Phone, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import {
  getMyExternalCoordination,
  listMyExternalCoordinationEvents,
  listMyExternalCoordinationOptions,
  selectExternalCoordinationOption,
} from '@/services/conciergeExternal'

const labels: Record<string, string> = {
  new: 'Recebido',
  researching: 'Buscando opções',
  options_ready: 'Opções prontas',
  awaiting_patient_choice: 'Escolha uma opção',
  selected: 'Opção escolhida',
  scheduling: 'Agendando',
  booked: 'Agendado',
  instructions_sent: 'Preparo enviado',
  completed: 'Realizado',
  result_expected: 'Aguardando resultado',
  result_received: 'Resultado recebido',
  closed: 'Concluído',
  cancelled: 'Cancelado',
}

function formatDateTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function money(value?: number | null) {
  if (value == null) return null
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ConciergeCoordinationDetail() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [task, setTask] = useState<any>(null)
  const [options, setOptions] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [choosingId, setChoosingId] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !id) return
    void load()
  }, [user?.id, id])

  async function load() {
    if (!user || !id) return
    setLoading(true)
    try {
      const [taskData, optionData, eventData] = await Promise.all([
        getMyExternalCoordination(id, user.id),
        listMyExternalCoordinationOptions(id),
        listMyExternalCoordinationEvents(id),
      ])
      setTask(taskData)
      setOptions(optionData)
      setEvents(eventData)
    } catch (error) {
      console.warn('External coordination detail unavailable:', error)
      toast.error('Não foi possível carregar esta coordenação.')
      setTask(null)
    } finally {
      setLoading(false)
    }
  }

  async function choose(option: any) {
    if (!task || !confirm('Escolher ' + option.provider_name + ' para o Concierge seguir com o agendamento?')) return
    setChoosingId(option.id)
    try {
      await selectExternalCoordinationOption(task.id, option.id)
      toast.success('Opção escolhida. O Concierge seguirá com o agendamento.')
      await load()
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível registrar sua escolha.')
    } finally {
      setChoosingId(null)
    }
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>

  if (!task) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/concierge/coordination')} className="flex items-center gap-2 text-sm"><ArrowLeft className="h-4 w-4" /> Voltar</button>
        <div className="rounded-2xl border bg-white p-6 text-center text-sm text-muted-foreground">Coordenação não encontrada.</div>
      </div>
    )
  }

  const canChoose = ['options_ready', 'awaiting_patient_choice'].includes(task.status)

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-emerald-800 p-5 text-white">
        <button type="button" onClick={() => navigate('/concierge/coordination')} className="mb-4 flex items-center gap-2 text-sm text-white/75"><ArrowLeft className="h-4 w-4" /> Coordenação</button>
        <span className="rounded-full bg-white/10 px-2 py-1 text-xs">{labels[task.status] || task.status}</span>
        <h1 className="mt-3 text-2xl font-bold">{task.title}</h1>
        {task.description && <p className="mt-2 text-sm leading-relaxed text-white/80">{task.description}</p>}
        {(task.city || task.state) && <p className="mt-3 flex items-center gap-1 text-xs text-white/65"><MapPin className="h-3.5 w-3.5" /> {[task.city, task.state].filter(Boolean).join('/')}</p>}
      </section>

      {canChoose && options.length > 0 && (
        <section>
          <div className="mb-3">
            <h2 className="font-bold text-gray-900">Escolha a melhor opção</h2>
            <p className="mt-1 text-xs text-muted-foreground">O Concierge seguirá com o agendamento depois da sua escolha.</p>
          </div>

          <div className="space-y-3">
            {options.map((option) => (
              <div key={option.id} className="rounded-2xl border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900">{option.provider_name}</p>
                    {option.provider_type && <p className="mt-1 text-xs text-muted-foreground">{option.provider_type}</p>}
                  </div>
                  {option.status === 'selected' && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-800">Escolhida</span>}
                </div>

                <div className="mt-3 space-y-2 text-sm text-gray-600">
                  {option.address && <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-700" /> {option.address}</p>}
                  {option.earliest_slot && <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-emerald-700" /> A partir de {formatDateTime(option.earliest_slot)}</p>}
                  {option.price_amount != null && <p className="font-semibold text-gray-800">{money(option.price_amount)}</p>}
                  {option.accepts_insurance != null && <p>Convênio: {option.accepts_insurance ? 'aceito conforme informação da unidade' : 'não confirmado/particular'}</p>}
                  {option.insurance_notes && <p className="text-xs">{option.insurance_notes}</p>}
                  {option.distance_text && <p className="text-xs">Distância aproximada: {option.distance_text}</p>}
                </div>

                {option.phone && <a href={'tel:' + option.phone} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700"><Phone className="h-3.5 w-3.5" /> Contato</a>}
                {option.website && <a href={option.website} target="_blank" rel="noreferrer" className="ml-4 mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700"><ExternalLink className="h-3.5 w-3.5" /> Site</a>}

                {option.status !== 'selected' && (
                  <button type="button" onClick={() => choose(option)} disabled={choosingId === option.id} className="mt-4 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
                    {choosingId === option.id ? 'Registrando...' : 'Escolher esta opção'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {['selected', 'scheduling'].includes(task.status) && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex gap-3"><CalendarCheck className="h-5 w-5 flex-shrink-0 text-blue-700" /><div><p className="font-bold text-blue-950">Sua escolha foi recebida</p><p className="mt-1 text-sm text-blue-900/80">O Concierge está fechando o horário e confirmando os detalhes com o prestador.</p></div></div>
        </section>
      )}

      {['booked', 'instructions_sent', 'completed', 'result_expected', 'result_received', 'closed'].includes(task.status) && (
        <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <div className="flex items-start gap-3">
            <CalendarCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-violet-700" />
            <div className="min-w-0">
              <p className="font-bold text-violet-950">{task.provider_name || 'Agendamento confirmado'}</p>
              {task.scheduled_at && <p className="mt-2 text-sm font-semibold text-violet-900">{formatDateTime(task.scheduled_at)}</p>}
              {task.provider_address && <p className="mt-2 flex items-start gap-1 text-sm text-violet-900/80"><MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" /> {task.provider_address}</p>}
              {task.booking_reference && <p className="mt-2 text-xs text-violet-900/70">Protocolo: {task.booking_reference}</p>}
            </div>
          </div>

          {task.preparation_instructions && (
            <div className="mt-4 rounded-xl bg-white/70 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-violet-800">Preparo / instruções</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-violet-950">{task.preparation_instructions}</p>
            </div>
          )}
        </section>
      )}

      {task.status === 'result_expected' && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-bold text-emerald-950">Agora estamos aguardando o resultado</p>
          <p className="mt-1 text-sm text-emerald-900/80">Quando o resultado chegar, o Concierge continua a jornada e organiza a revisão/próximo passo.</p>
        </section>
      )}

      {['result_received', 'closed'].includes(task.status) && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex gap-3"><CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-700" /><div><p className="font-bold text-emerald-950">{task.status === 'closed' ? 'Etapa concluída' : 'Resultado recebido'}</p><p className="mt-1 text-sm text-emerald-900/80">{task.status === 'closed' ? 'Este loop foi fechado. O histórico permanece no HealthWallet.' : 'O resultado foi recebido e segue para o próximo passo definido pela equipe.'}</p></div></div>
        </section>
      )}

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-700" /><h2 className="font-bold">Acompanhamento</h2></div>
        <div className="mt-4 space-y-4">
          {events.length === 0 ? <p className="text-sm text-muted-foreground">As atualizações desta coordenação aparecerão aqui.</p> : events.map((event) => (
            <div key={event.id} className="relative pl-5">
              <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <p className="text-sm font-medium text-gray-900">{event.message || 'Atualização do Concierge'}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(event.created_at)} · {event.actor_role === 'patient' ? 'Você' : 'Concierge'}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
