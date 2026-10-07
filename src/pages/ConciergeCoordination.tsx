import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarCheck, ChevronRight, Loader2, MapPin, Search, Stethoscope } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { listMyExternalCoordinations } from '@/services/conciergeExternal'

const labels: Record<string, string> = {
  new: 'Recebido',
  researching: 'Buscando opções',
  options_ready: 'Opções prontas',
  awaiting_patient_choice: 'Aguardando sua escolha',
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

function badge(status: string) {
  if (status === 'awaiting_patient_choice') return 'bg-amber-100 text-amber-800'
  if (['booked', 'instructions_sent'].includes(status)) return 'bg-violet-100 text-violet-800'
  if (['completed', 'result_expected', 'result_received'].includes(status)) return 'bg-emerald-100 text-emerald-800'
  if (status === 'closed') return 'bg-slate-100 text-slate-700'
  return 'bg-blue-100 text-blue-800'
}

export default function ConciergeCoordination() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])

  useEffect(() => {
    if (!user) return
    void load()
  }, [user?.id])

  async function load() {
    if (!user) return
    setLoading(true)
    try {
      setItems(await listMyExternalCoordinations(user.id))
    } catch (error) {
      console.warn('External coordination unavailable:', error)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const active = useMemo(() => items.filter((item) => !['closed', 'cancelled'].includes(item.status)), [items])
  const closed = useMemo(() => items.filter((item) => ['closed', 'cancelled'].includes(item.status)), [items])

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-emerald-800 p-5 text-white">
        <button type="button" onClick={() => navigate('/concierge')} className="mb-4 flex items-center gap-2 text-sm text-white/75"><ArrowLeft className="h-4 w-4" /> Concierge</button>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/60"><CalendarCheck className="h-4 w-4" /> Coordenação</div>
        <h1 className="mt-2 text-2xl font-bold">Meus agendamentos coordenados</h1>
        <p className="mt-2 text-sm text-white/80">Acompanhe desde a busca por opções até o resultado e o próximo passo.</p>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Stat label="Em andamento" value={active.length} />
        <Stat label="Aguardando você" value={items.filter((item) => item.status === 'awaiting_patient_choice').length} />
        <Stat label="Agendados" value={items.filter((item) => ['booked', 'instructions_sent'].includes(item.status)).length} />
      </section>

      <section>
        <h2 className="mb-3 font-bold text-gray-900">Em andamento</h2>
        <div className="space-y-3">
          {active.length === 0 && <Empty />}
          {active.map((item) => (
            <Link key={item.id} to={'/concierge/coordination/' + item.id} className="block rounded-2xl border bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Stethoscope className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <span className={'rounded-full px-2 py-1 text-[11px] font-semibold ' + badge(item.status)}>{labels[item.status] || item.status}</span>
                  <h3 className="mt-3 font-bold text-gray-900">{item.title}</h3>
                  {item.provider_name && <p className="mt-1 text-sm text-gray-600">{item.provider_name}</p>}
                  {item.city && <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {item.city}{item.state ? '/' + item.state : ''}</p>}
                </div>
                <ChevronRight className="mt-2 h-5 w-5 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="mb-3 font-bold text-gray-900">Concluídos</h2>
          <div className="space-y-2">
            {closed.map((item) => (
              <Link key={item.id} to={'/concierge/coordination/' + item.id} className="flex items-center gap-3 rounded-2xl border bg-slate-50 p-4">
                <CalendarCheck className="h-5 w-5 text-slate-600" />
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{labels[item.status] || item.status}</p></div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border bg-white p-3 text-center"><p className="text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>
}

function Empty() {
  return <div className="rounded-2xl border border-dashed bg-white p-6 text-center"><Search className="mx-auto h-7 w-7 text-emerald-600" /><p className="mt-3 font-semibold">Nenhuma coordenação em andamento</p><p className="mt-1 text-sm text-muted-foreground">Quando o Concierge estiver organizando um exame ou consulta para você, aparecerá aqui.</p></div>
}
