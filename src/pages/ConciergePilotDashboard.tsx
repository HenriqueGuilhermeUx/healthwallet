import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, DatabaseZap, Gauge, Loader2, Scale, Stethoscope, Users } from 'lucide-react'
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

  const segments = metrics.planSegments || []
  const withPlan = segments.find((item: any) => item.key === 'with_plan')
  const withoutPlan = segments.find((item: any) => item.key === 'without_plan')
  const unknownPlan = segments.find((item: any) => item.key === 'unknown_plan')
  const quality = metrics.dataQuality || {}

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
        <h2 className="font-bold">Composição da carteira</h2>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <SmallMetric label="Com plano" value={metrics.withPlan} />
          <SmallMetric label="Sem plano" value={metrics.withoutPlan} />
          <SmallMetric label="Não informado" value={metrics.unknownPlan} />
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
        <div className="flex items-center gap-2"><Scale className="h-5 w-5 text-indigo-700" /><h2 className="font-bold">Com plano × sem plano</h2></div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Compare utilização e carga humana por perfil. Isso ajuda a descobrir onde existe valor e onde a operação fica mais pesada.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SegmentCard segment={withPlan} />
          <SegmentCard segment={withoutPlan} />
        </div>

        {withPlan?.patients > 0 && withoutPlan?.patients > 0 && (
          <ComparisonHint withPlan={withPlan} withoutPlan={withoutPlan} />
        )}

        {unknownPlan?.patients > 0 && (
          <div className="mt-3 rounded-xl border border-dashed bg-white p-3 text-xs text-slate-600">
            <strong>{unknownPlan.patients}</strong> paciente(s) ainda sem informação de plano. Completar esse dado aumenta a qualidade da comparação.
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-2"><DatabaseZap className="h-5 w-5 text-cyan-700" /><h2 className="font-bold">Qualidade dos dados do piloto</h2></div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Antes de usar unit economics para decidir preço ou equipe, confirme se a operação está registrando os dados de forma consistente.</p>
        <div className="mt-4 space-y-3">
          <QualityBar label="Perfil com/sem plano preenchido" value={quality.healthPlanCoverage || 0} />
          <QualityBar label="Casos com 1ª resposta mensurada" value={quality.firstResponseCoverage || 0} />
          <QualityBar label="Casos com tempo humano registrado" value={quality.workLogCoverage || 0} />
          <QualityBar label="Casos resolvidos com timestamp" value={quality.resolutionTimestampCoverage || 0} />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-600">Quanto mais perto de 100%, mais confiável fica a leitura operacional. Cobertura baixa não é resultado ruim do Concierge; é sinal de instrumentação incompleta.</p>
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
        Durante o piloto, preço continua sendo hipótese. A comparação acima mede comportamento e custo operacional observado; ela não prova causalidade entre ter plano de saúde e consumir mais ou menos Concierge.
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

function SegmentCard({ segment }: { segment: any }) {
  if (!segment) return null

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold">{segment.label}</p>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">{segment.patients} pacientes</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4">
        <SegmentMetric label="Solicitações / paciente" value={number(segment.requestsPerPatient)} />
        <SegmentMetric label="Min humanos / paciente" value={number(segment.humanMinutesPerPatient)} />
        <SegmentMetric label="Min médico / paciente" value={number(segment.doctorMinutesPerPatient)} />
        <SegmentMetric label="Min enfermagem / paciente" value={number(segment.nurseMinutesPerPatient)} />
        <SegmentMetric label="Escalamento médico" value={pct(segment.escalationRate)} />
        <SegmentMetric label="Uso recorrente" value={pct(segment.repeatRate)} />
        <SegmentMetric label="Pacientes com uso" value={pct(segment.engagementRate)} />
        <SegmentMetric label="Resolução" value={pct(segment.resolutionRate)} />
      </div>
    </div>
  )
}

function SegmentMetric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-base font-bold text-slate-900">{value}</p><p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{label}</p></div>
}

function ComparisonHint({ withPlan, withoutPlan }: { withPlan: any; withoutPlan: any }) {
  const humanDelta = withoutPlan.humanMinutesPerPatient - withPlan.humanMinutesPerPatient
  const doctorDelta = withoutPlan.doctorMinutesPerPatient - withPlan.doctorMinutesPerPatient
  const requestDelta = withoutPlan.requestsPerPatient - withPlan.requestsPerPatient

  const direction = humanDelta > 0 ? 'sem plano' : humanDelta < 0 ? 'com plano' : 'nenhum dos grupos'
  const humanText = Math.abs(humanDelta) < 0.1
    ? 'A carga humana por paciente está praticamente igual entre os dois grupos.'
    : `Neste recorte, o grupo ${direction} consome ${number(Math.abs(humanDelta))} min humanos a mais por paciente.`

  return (
    <div className="mt-3 rounded-xl bg-indigo-100/70 p-3 text-xs leading-relaxed text-indigo-950">
      <p className="font-semibold">Leitura operacional do recorte</p>
      <p className="mt-1">{humanText}</p>
      <p className="mt-1 text-indigo-900/75">Diferença sem plano − com plano: {number(requestDelta)} solicitação(ões)/paciente e {number(doctorDelta)} min médicos/paciente. Use isso como sinal para investigar, não como conclusão de preço.</p>
    </div>
  )
}

function QualityBar({ label, value }: { label: string; value: number }) {
  const width = Math.max(0, Math.min(100, value))
  return <div><div className="mb-1 flex items-center justify-between gap-3 text-xs"><span>{label}</span><span className="font-bold">{pct(width)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600" style={{ width: `${width}%` }} /></div></div>
}

function Bar({ label, value, total }: { label: string; value: number; total: number }) {
  const width = Math.max(0, Math.min(100, (value / total) * 100))
  return <div><div className="mb-1 flex justify-between text-xs"><span>{label}</span><span className="font-semibold">{number(value, 0)} min</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${width}%` }} /></div></div>
}
