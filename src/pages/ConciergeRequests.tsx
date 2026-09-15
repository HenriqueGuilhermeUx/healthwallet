import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Clock, Loader2, MessageCircle, PlusCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { listMyConciergeRequests } from '@/services/concierge'

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

const categoryLabels: Record<string, string> = {
  symptom: 'Sintoma',
  guidance: 'Orientação',
  exam_review: 'Exames',
  second_analysis: 'Segunda análise',
  medication_review: 'Medicamentos',
  navigation: 'Navegação em saúde',
  other: 'Outro assunto',
}

function formatDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function ConciergeRequests() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (!user) return
    void load()
  }, [user?.id])

  async function load() {
    if (!user) return
    setLoading(true)
    setUnavailable(false)
    try {
      setItems(await listMyConciergeRequests(user.id))
    } catch (error) {
      console.warn('Concierge requests unavailable:', error)
      setUnavailable(true)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
  }

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 to-emerald-900 p-5 text-white">
        <button type="button" onClick={() => navigate('/concierge')} className="mb-4 flex items-center gap-2 text-sm text-white/80">
          <ArrowLeft className="h-4 w-4" /> Concierge
        </button>
        <p className="text-xs uppercase tracking-wider text-white/60">Acompanhamento longitudinal</p>
        <h1 className="mt-2 text-2xl font-bold">Minhas solicitações</h1>
        <p className="mt-2 text-sm text-white/75">Cada pedido fica registrado do início ao próximo passo, sem se perder em conversas soltas.</p>
      </section>

      <Link to="/concierge/request" className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 p-4 font-bold text-white">
        <PlusCircle className="h-5 w-5" /> Nova solicitação
      </Link>

      {unavailable && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          O motor Concierge ainda não foi ativado no banco. A interface está pronta para a fase de validação.
        </div>
      )}

      {!unavailable && items.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-white p-6 text-center">
          <MessageCircle className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="mt-3 font-semibold">Nenhuma solicitação ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">Quando precisar de ajuda, sua solicitação ficará acompanhada aqui.</p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <Link key={item.id} to={`/concierge/requests/${item.id}`} className="block rounded-2xl border bg-white p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">{categoryLabels[item.category] || item.category}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">{statusLabels[item.status] || item.status}</span>
                  {item.urgency === 'priority' && <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800">Prioridade</span>}
                  {item.urgency === 'urgent_redirect' && <span className="rounded-full bg-red-100 px-2 py-1 font-semibold text-red-800">Orientado à urgência</span>}
                </div>
                <h2 className="mt-3 font-bold text-gray-900">{item.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {formatDate(item.created_at)}</div>
              </div>
              <ChevronRight className="mt-2 h-5 w-5 flex-shrink-0 text-muted-foreground" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
