import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarDays, CheckCircle2, Circle, Loader2, Target } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { completeConciergeAction, listMyConciergeActions, reopenConciergeAction } from '@/services/concierge'

function formatDate(value?: string | null) {
  if (!value) return 'Sem prazo definido'
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? 'Sem prazo definido' : date.toLocaleDateString('pt-BR')
}

export default function ConciergePlan() {
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
      setItems(await listMyConciergeActions(user.id))
    } catch (error) {
      console.warn('Concierge plan unavailable:', error)
      setUnavailable(true)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  async function toggle(item: any) {
    if (!user) return
    try {
      if (item.status === 'completed') await reopenConciergeAction(item.id, user.id)
      else await completeConciergeAction(item.id, user.id)
      await load()
    } catch (error) {
      console.error('Action update failed:', error)
      toast.error('Não foi possível atualizar esta ação.')
    }
  }

  const openItems = useMemo(() => items.filter((item) => item.status !== 'completed' && item.status !== 'cancelled'), [items])
  const completed = useMemo(() => items.filter((item) => item.status === 'completed'), [items])

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-teal-800 to-emerald-700 p-5 text-white">
        <button type="button" onClick={() => navigate('/concierge')} className="mb-4 flex items-center gap-2 text-sm text-white/80"><ArrowLeft className="h-4 w-4" /> Concierge</button>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/70"><Target className="h-4 w-4" /> Coordenação contínua</div>
        <h1 className="mt-2 text-2xl font-bold">Meu Plano de Ação</h1>
        <p className="mt-2 text-sm text-white/80">Exames, retornos, vacinas, hábitos e acompanhamentos organizados em próximos passos concretos.</p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Pendentes" value={openItems.length} />
        <Stat label="Concluídas" value={completed.length} />
      </div>

      {unavailable && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">O banco do Concierge ainda não foi ativado. Esta tela fica pronta para a validação antes de publicação.</div>}

      {!unavailable && openItems.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-white p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="mt-3 font-semibold">Nenhuma ação pendente</p>
          <p className="mt-1 text-sm text-muted-foreground">Quando sua equipe criar próximos passos, eles aparecerão aqui.</p>
        </div>
      )}

      <div className="space-y-3">
        {openItems.map((item) => <ActionRow key={item.id} item={item} onToggle={() => toggle(item)} />)}
      </div>

      {completed.length > 0 && (
        <section>
          <h2 className="mb-3 font-bold text-gray-900">Concluídas</h2>
          <div className="space-y-3">{completed.slice(0, 12).map((item) => <ActionRow key={item.id} item={item} onToggle={() => toggle(item)} />)}</div>
        </section>
      )}
    </div>
  )
}

function ActionRow({ item, onToggle }: { item: any; onToggle: () => void }) {
  const done = item.status === 'completed'
  return (
    <div className={`rounded-2xl border bg-white p-4 ${done ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={onToggle} className="mt-0.5 text-emerald-700">{done ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-6 w-6" />}</button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">{item.category || 'geral'}</span>
            {item.priority === 'high' && <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">Prioridade</span>}
          </div>
          <p className={`mt-2 font-semibold ${done ? 'line-through' : ''}`}>{item.title}</p>
          {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
          <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> {formatDate(item.due_date)}</p>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border bg-white p-4"><p className="text-2xl font-bold text-gray-900">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>
}
