import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Loader2,
  ShieldAlert,
  Stethoscope,
  UserCheck,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import {
  assignRequestToSelf,
  getConciergeStaffSelf,
  listOperationsAlerts,
  listOperationsRequests,
  updateConciergeRequestStatus,
} from '@/services/concierge'

const statusLabels: Record<string, string> = {
  new: 'Novo',
  in_triage: 'Em triagem',
  waiting_patient: 'Aguardando paciente',
  waiting_nurse: 'Aguardando enfermagem',
  escalated_medical: 'Encaminhado ao médico',
  medical_review: 'Revisão médica',
  action_plan: 'Plano de ação',
}

const categoryLabels: Record<string, string> = {
  symptom: 'Sintoma',
  guidance: 'Orientação',
  exam_review: 'Exame',
  second_analysis: 'Segunda análise',
  medication_review: 'Medicamentos',
  navigation: 'Navegação',
  other: 'Outro',
}

function ageInHours(value?: string) {
  if (!value) return 0
  const created = new Date(value).getTime()
  return Math.max(0, Math.floor((Date.now() - created) / 36e5))
}

export default function ConciergeOperations() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState<any>(null)
  const [requests, setRequests] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

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
      if (!staffData?.active) {
        setRequests([])
        setAlerts([])
        return
      }
      const [requestData, alertData] = await Promise.all([
        listOperationsRequests(),
        listOperationsAlerts(),
      ])
      setRequests(requestData)
      setAlerts(alertData)
    } catch (error) {
      console.error('Concierge operations unavailable:', error)
      setStaff(null)
    } finally {
      setLoading(false)
    }
  }

  const stats = useMemo(() => ({
    new: requests.filter((item) => item.status === 'new').length,
    triage: requests.filter((item) => ['in_triage', 'waiting_nurse'].includes(item.status)).length,
    medical: requests.filter((item) => ['escalated_medical', 'medical_review'].includes(item.status)).length,
    alerts: alerts.length,
  }), [requests, alerts])

  async function takeCase(item: any) {
    if (!staff) return
    setBusyId(item.id)
    try {
      await assignRequestToSelf(item, staff)
      toast.success('Caso atribuído a você')
      await load()
    } catch (error) {
      console.error('Assign case failed:', error)
      toast.error('Não foi possível assumir o caso.')
    } finally {
      setBusyId(null)
    }
  }

  async function escalate(item: any) {
    if (!staff) return
    setBusyId(item.id)
    try {
      await updateConciergeRequestStatus(item, staff, 'escalated_medical', 'Caso encaminhado para revisão médica pela equipe Concierge.')
      toast.success('Encaminhado para revisão médica')
      await load()
    } catch (error) {
      console.error('Escalation failed:', error)
      toast.error('Não foi possível encaminhar o caso.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>

  if (!staff?.active) {
    return (
      <div className="space-y-5 pb-28">
        <section className="rounded-3xl bg-slate-900 p-5 text-white">
          <div className="flex items-center gap-2 text-white/70"><ShieldAlert className="h-5 w-5" /> MyDataMed · Concierge Ops</div>
          <h1 className="mt-2 text-2xl font-bold">Área profissional restrita</h1>
          <p className="mt-2 text-sm text-white/75">Somente profissionais cadastrados explicitamente na equipe Concierge podem acessar a fila assistencial.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-teal-950 to-emerald-900 p-5 text-white">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/60"><Stethoscope className="h-4 w-4" /> MyDataMed · Health Operations</div>
        <h1 className="mt-2 text-2xl font-bold">Fila Concierge</h1>
        <p className="mt-2 text-sm text-white/75">{staff.display_name || 'Profissional'} · {staff.role}</p>
        <p className="mt-1 text-xs text-white/55">A prioridade é coordenar, resolver no nível adequado e escalar somente quando necessário.</p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Stat icon={BellRing} label="Novos" value={stats.new} />
        <Stat icon={Clock3} label="Em triagem" value={stats.triage} />
        <Stat icon={Stethoscope} label="Revisão médica" value={stats.medical} />
        <Stat icon={AlertTriangle} label="Alertas" value={stats.alerts} />
      </section>

      {alerts.length > 0 && (
        <section>
          <h2 className="mb-3 font-bold text-gray-900">Alertas para revisar</h2>
          <div className="space-y-2">
            {alerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className={`rounded-2xl border p-4 ${alert.severity === 'high' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`h-5 w-5 flex-shrink-0 ${alert.severity === 'high' ? 'text-red-700' : 'text-amber-700'}`} />
                  <div><p className="font-semibold">{alert.title}</p>{alert.explanation && <p className="mt-1 text-sm text-muted-foreground">{alert.explanation}</p>}<p className="mt-2 text-xs text-muted-foreground">Origem: {alert.source}</p></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-gray-900">Casos ativos</h2><span className="text-xs text-muted-foreground">{requests.length} na fila</span></div>
        {requests.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white p-6 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><p className="mt-3 font-semibold">Fila limpa</p><p className="mt-1 text-sm text-muted-foreground">Nenhuma solicitação ativa agora.</p></div>
        ) : (
          <div className="space-y-3">
            {requests.map((item) => {
              const assignedToMe = item.assigned_nurse_id === user?.id || item.assigned_doctor_id === user?.id
              const unassigned = !item.assigned_nurse_id && !item.assigned_doctor_id
              return (
                <div key={item.id} className="rounded-2xl border bg-white p-4">
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.urgency === 'urgent_redirect' ? 'bg-red-100 text-red-700' : item.urgency === 'priority' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}><Users className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2 text-[11px]"><span className="rounded-full bg-slate-100 px-2 py-1 font-semibold">{categoryLabels[item.category] || item.category}</span><span className="rounded-full bg-slate-100 px-2 py-1 font-semibold">{statusLabels[item.status] || item.status}</span>{ageInHours(item.created_at) >= 24 && <span className="rounded-full bg-orange-100 px-2 py-1 font-semibold text-orange-800">{ageInHours(item.created_at)}h na fila</span>}</div>
                      <p className="mt-2 font-bold">{item.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    <Link to={`/concierge/ops/case/${item.id}`} className="mt-1"><ChevronRight className="h-5 w-5 text-muted-foreground" /></Link>
                  </div>
                  <div className="mt-4 flex gap-2">
                    {unassigned && <button type="button" disabled={busyId === item.id} onClick={() => takeCase(item)} className="flex-1 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white flex items-center justify-center gap-1"><UserCheck className="h-4 w-4" /> Assumir</button>}
                    {(assignedToMe || staff.role === 'admin' || staff.role === 'care_coordinator') && !['escalated_medical', 'medical_review'].includes(item.status) && <button type="button" disabled={busyId === item.id} onClick={() => escalate(item)} className="flex-1 rounded-xl bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white">Encaminhar médico</button>}
                    <Link to={`/concierge/ops/case/${item.id}`} className="flex-1 rounded-xl border px-3 py-2.5 text-center text-xs font-bold">Abrir caso</Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return <div className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4" /><span className="text-xs">{label}</span></div><p className="mt-2 text-2xl font-bold">{value}</p></div>
}
