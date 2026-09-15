import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Gauge, Loader2, Stethoscope, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getConciergeStaffSelf } from '@/services/concierge'
import { loadConciergePilotMetrics } from '@/services/conciergeAnalytics'

function pct(value: number) {
  return `${value.toFixed(1)}%`
}

function number(value: number, digits = 1) {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits })
}

export default function ConciergePilotDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState<any>(null)
  const [metrics, setMetrics] = useState<any>(null)

  useEffect(() => {
    if (!user) return
    void load()
  }, [user?.id])

  async function load() {
    if (!user) return
    setLoading(true)
    try {
      const staffData = await getConciergeStaffSelf(user.id)
      setStaff(staffData)
      if (!staffData?.active || !['admin', 'care_coordinator'].includes(staffData.role)) return
      setMetrics(await loadConciergePilotMetrics())
    } catch (error) {
      console.error('Pilot metrics failed:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>

  if (!staff?.active || !['admin', 'care_coordinator'].includes(staff.role)) {
    return <div className="rounded-2xl border bg-white p-6 text-center text-sm text-muted-foreground">Dashboard do piloto restrito à coordenação do Health Concierge.</div>
  }

  if (!metrics) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Ative primeiro a migration de analytics do piloto para medir unit economics.</div>
  }

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-emerald-950 to-teal-800 p-5 text-white">
        <button type="button" onClick={() => navigate('/concierge/ops')} className="mb-4 flex items-center gap-2 text-sm text-white/70"><ArrowLeft className="h-4 w-4" /> Operação</button>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/60"><Gauge className="h-4 w-4" /> Pilot Economics</div>
        <h1 className="mt-2 text-2xl font-bold">Validação do modelo</h1>
        <p className="mt-2 text-sm text-white/75">Métricas dos últimos 30 dias para responder a pergunta central: quanto acompanhamento humano cada paciente realmente consome?</p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Metric label="Pacientes ativos" value={number(metrics.activePatients, 0)} />
        <Metric label="Solicitações / paciente" value={number(metrics.requestsPerPatient)} />
        <Metric label="Minutos humanos / paciente" value={number(metrics.humanMinutesPerPatient)} />
        <Metric label="Escalamento médico" value={pct(metrics.escalationRate)} />
        <Metric label="1ª resposta média" value={`${number(metrics.avgFirstResponseMinutes, 0)} min`} />
        <Metric label="Resolução média" value={`${number(metrics.avgResolutionHours)} h`} />
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <h2 className="font-bold">Quem está comprando?</h2>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <SmallMetric label="Com plano" value={metrics.withPlan} />
          <SmallMetric label="Sem plano" value={metrics.withoutPlan} />
          <SmallMetric label="Não informado" value={metrics.unknownPlan} />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">A comparação entre com e sem plano deve ser analisada também por retenção, quantidade de casos e minutos humanos — não apenas aquisição.</p>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-2"><Users className="h-5 w-5 text-emerald-700" /><h2 className="font-bold">Carga humana em 30 dias</h2></div>
        <div className="mt-4 space-y-3">
          <Bar label="Enfermagem / coordenação" value={metrics.nurseMinutes} total={Math.max(metrics.totalHumanMinutes, 1)} />
          <Bar label="Médicos" value={metrics.doctorMinutes} total={Math.max(metrics.totalHumanMinutes, 1)} />
        </div>
        <p className="mt-4 text-sm"><strong>{number(metrics.totalHumanMinutes, 0)} min</strong> de trabalho humano registrado.</p>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-emerald-700" /><h2 className="font-bold">Funil assistencial</h2></div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <SmallMetric label="Solicitações" value={metrics.requests30d} />
          <SmallMetric label="Escaladas" value={metrics.escalated} />
          <SmallMetric label="Resolvidas" value={metrics.resolved} />
        </div>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        Durante o piloto, preço é uma hipótese. A métrica principal é custo humano real por paciente, separado por perfil com plano e sem plano. É isso que permite precificar sem virar uma clínica de consultas ilimitadas.
      </section>

      <Link to="/concierge/ops" className="block rounded-2xl bg-slate-900 p-4 text-center text-sm font-bold text-white">Voltar para a fila operacional</Link>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border bg-white p-4"><p className="text-xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>
}

function SmallMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>
}

function Bar({ label, value, total }: { label: string; value: number; total: number }) {
  const width = Math.max(0, Math.min(100, (value / total) * 100))
  return <div><div className="mb-1 flex justify-between text-xs"><span>{label}</span><span className="font-semibold">{number(value, 0)} min</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${width}%` }} /></div></div>
}
