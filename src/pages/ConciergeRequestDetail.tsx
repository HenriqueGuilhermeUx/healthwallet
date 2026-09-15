import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, Loader2, Send, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { addPatientRequestMessage, getConciergeRequest, listConciergeRequestEvents } from '@/services/concierge'
import ConciergeClinicalReviewPanel from '@/components/ConciergeClinicalReviewPanel'

const statusLabels: Record<string, string> = {
  new: 'Recebido',
  in_triage: 'Em triagem',
  waiting_patient: 'Aguardando você',
  waiting_nurse: 'Aguardando equipe',
  escalated_medical: 'Encaminhado ao médico',
  medical_review: 'Em revisão médica',
  action_plan: 'Plano de ação criado',
  resolved: 'Resolvido',
  closed: 'Encerrado',
}

function formatDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function ConciergeRequestDetail() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [request, setRequest] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!id) return
    void load()
  }, [id])

  async function load() {
    setLoading(true)
    try {
      const [requestData, eventData] = await Promise.all([
        getConciergeRequest(id),
        listConciergeRequestEvents(id),
      ])
      setRequest(requestData)
      setEvents(eventData.filter((item: any) => item.visibility !== 'staff_only'))
    } catch (error) {
      console.error('Concierge request detail failed:', error)
      toast.error('Não foi possível carregar esta solicitação.')
    } finally {
      setLoading(false)
    }
  }

  async function sendMessage() {
    if (!user || !message.trim()) return
    setSending(true)
    try {
      await addPatientRequestMessage(id, user.id, message.trim())
      setMessage('')
      await load()
    } catch (error) {
      console.error('Patient concierge message failed:', error)
      toast.error('Não foi possível enviar a mensagem.')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
  }

  if (!request) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/concierge/requests')} className="flex items-center gap-2 text-sm"><ArrowLeft className="h-4 w-4" /> Voltar</button>
        <div className="rounded-2xl border bg-white p-6 text-center text-sm text-muted-foreground">Solicitação não encontrada.</div>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-emerald-800 to-slate-900 p-5 text-white">
        <button type="button" onClick={() => navigate('/concierge/requests')} className="mb-4 flex items-center gap-2 text-sm text-white/75"><ArrowLeft className="h-4 w-4" /> Minhas solicitações</button>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white/10 px-2 py-1">{statusLabels[request.status] || request.status}</span>
          {request.subject_name && <span className="rounded-full bg-white/10 px-2 py-1">Para {request.subject_name}</span>}
        </div>
        <h1 className="mt-3 text-2xl font-bold">{request.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/80">{request.description}</p>
        <div className="mt-4 flex items-center gap-1 text-xs text-white/60"><Clock className="h-3.5 w-3.5" /> Criado em {formatDate(request.created_at)}</div>
      </section>

      {request.urgency === 'urgent_redirect' && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-900">
          Esta solicitação registrou sinais potencialmente graves. O Concierge não substitui atendimento de urgência.
        </section>
      )}

      <ConciergeClinicalReviewPanel request={request} patientMode />

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-700" />
          <h2 className="font-bold">Acompanhamento</h2>
        </div>
        <div className="mt-4 space-y-4">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sua solicitação foi recebida. As atualizações aparecerão aqui.</p>
          ) : events.map((item) => (
            <div key={item.id} className="relative pl-5">
              <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <p className="text-sm font-medium text-gray-900">{item.message || 'Atualização do caso'}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(item.created_at)} · {item.actor_role === 'patient' ? 'Você' : item.actor_role === 'system' ? 'HealthWallet' : 'Sua equipe'}</p>
            </div>
          ))}
        </div>
      </section>

      {!['resolved', 'closed'].includes(request.status) && (
        <section className="rounded-2xl border bg-white p-4">
          <label className="text-sm font-semibold">Enviar informação para a equipe</label>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} placeholder="Adicione uma informação, resposta ou atualização..." className="mt-2 w-full resize-none rounded-xl border px-3 py-3 text-sm" />
          <button type="button" onClick={sendMessage} disabled={sending || !message.trim()} className="mt-3 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar atualização
          </button>
        </section>
      )}
    </div>
  )
}
