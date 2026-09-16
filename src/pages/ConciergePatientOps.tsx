import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Loader2,
  ShieldCheck,
  Stethoscope,
  Target,
  Users,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getConciergeStaffSelf } from '@/services/concierge'
import { supabase } from '@/lib/supabase'

const roleLabels: Record<string, string> = {
  nurse: 'Enfermagem',
  doctor: 'Médico',
  care_coordinator: 'Coordenação',
  admin: 'Administração',
}

const statusLabels: Record<string, string> = {
  new: 'Novo',
  in_triage: 'Em triagem',
  waiting_patient: 'Aguardando paciente',
  waiting_nurse: 'Aguardando equipe',
  escalated_medical: 'Encaminhado ao médico',
  medical_review: 'Revisão médica',
  action_plan: 'Plano de ação',
  resolved: 'Resolvido',
  closed: 'Encerrado',
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR')
}

export default function ConciergePatientOps() {
  const { patientId = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState<any>(null)
  const [membership, setMembership] = useState<any>(null)
  const [assignments, setAssignments] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [actions, setActions] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (!user || !patientId) return
    void load()
  }, [user?.id, patientId])

  async function load() {
    if (!user || !patientId) return
    setLoading(true)
    setDenied(false)
    try {
      const staffData = await getConciergeStaffSelf(user.id)
      setStaff(staffData)
      if (!staffData?.active) {
        setDenied(true)
        return
      }

      const membershipRes = await supabase
        .from('concierge_memberships')
        .select('*')
        .eq('patient_id', patientId)
        .maybeSingle()

      if (membershipRes.error) throw membershipRes.error
      if (!membershipRes.data) {
        setDenied(true)
        return
      }
      setMembership(membershipRes.data)

      const [assignmentRes, requestRes, actionRes, alertRes] = await Promise.all([
        supabase.from('concierge_assignments').select('*').eq('patient_id', patientId).eq('status', 'active').order('is_primary', { ascending: false }),
        supabase.from('concierge_requests').select('id,title,category,status,urgency,created_at,updated_at,assigned_nurse_id,assigned_doctor_id').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(30),
        supabase.from('concierge_actions').select('id,title,status,priority,due_date,request_id,created_at').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(30),
        supabase.from('concierge_alerts').select('id,title,severity,status,source,created_at').eq('patient_id', patientId).eq('status', 'open').order('created_at', { ascending: false }).limit(30),
      ])

      if (assignmentRes.error) throw assignmentRes.error
      if (requestRes.error) throw requestRes.error
      if (actionRes.error) throw actionRes.error
      if (alertRes.error) throw alertRes.error

      setAssignments(assignmentRes.data || [])
      setRequests(requestRes.data || [])
      setActions(actionRes.data || [])
      setAlerts(alertRes.data || [])
    } catch (error) {
      console.warn('Concierge patient operations workspace denied/unavailable:', error)
      setDenied(true)
    } finally {
      setLoading(false)
    }
  }

  const openRequests = useMemo(() => requests.filter((item) => !['resolved', 'closed'].includes(item.status)), [requests])
  const openActions = useMemo(() => actions.filter((item) => !['completed', 'cancelled'].includes(item.status)), [actions])
  const primaryNurse = assignments.find((item) => item.is_primary && ['nurse', 'care_coordinator'].includes(item.role))
  const primaryDoctor = assignments.find((item) => item.is_primary && item.role === 'doctor')
  const patientName = membership?.metadata?.patient_name || membership?.metadata?.patient_email || 'Paciente Concierge'

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>

  if (denied || !staff?.active || !membership) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/concierge/ops')} className="flex items-center gap-2 text-sm text-slate-600"><ArrowLeft className="h-4 w-4" /> Voltar à operação</button>
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="font-bold text-amber-950">Carteira indisponível para este profissional</p>
          <p className="mt-2 text-sm leading-relaxed text-amber-900/80">O paciente precisa ter consentimento ativo e estar dentro da sua autorização operacional. Coordenação administrativa pode verificar vínculo e consentimento na carteira.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-teal-950 to-emerald-900 p-5 text-white">
        <button type="button" onClick={() => navigate('/concierge/ops')} className="mb-4 flex items-center gap-2 text-sm text-white/70"><ArrowLeft className="h-4 w-4" /> Operação</button>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full bg-white/10 px-2.5 py-1">{membership.status}</span>
          <span className={`rounded-full px-2.5 py-1 ${membership.consent_status === 'accepted' ? 'bg-emerald-400/20 text-emerald-100' : 'bg-amber-300/20 text-amber-100'}`}>consentimento {membership.consent_status || 'pendente'}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">{membership.has_health_plan === true ? 'com plano' : membership.has_health_plan === false ? 'sem plano' : 'plano não informado'}</span>
        </div>
        <h1 className="mt-3 text-2xl font-bold">{patientName}</h1>
        <p className="mt-1 text-sm text-white/70">Workspace operacional da carteira · {roleLabels[staff.role] || staff.role}</p>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3"><ShieldCheck className="h-5 w-5 flex-shrink-0 text-blue-700" /><div><p className="text-sm font-bold text-blue-950">Visão operacional — sem prontuário aberto</p><p className="mt-1 text-xs leading-relaxed text-blue-900/75">Esta tela mostra somente o trabalho do Concierge. Exames, MedScore, dispositivos, medicamentos e demais dados clínicos são carregados apenas dentro de um caso autorizado, sob demanda e com registro de acesso.</p></div></div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Stat label="Casos ativos" value={openRequests.length} />
        <Stat label="Ações abertas" value={openActions.length} />
        <Stat label="Alertas" value={alerts.length} attention={alerts.length > 0} />
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-2"><Users className="h-5 w-5 text-emerald-700" /><h2 className="font-bold">Equipe de referência</h2></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <TeamCard label="Enfermagem / coordenação" member={primaryNurse} />
          <TeamCard label="Médico" member={primaryDoctor} />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><div><h2 className="font-bold">Casos</h2><p className="mt-1 text-xs text-muted-foreground">Abra o caso para acessar somente o contexto autorizado daquela necessidade.</p></div><span className="text-xs text-muted-foreground">{requests.length}</span></div>
        {requests.length === 0 ? <Empty text="Nenhum caso registrado." /> : (
          <div className="space-y-2">{requests.map((item) => <Link key={item.id} to={`/concierge/ops/case/${item.id}`} className="flex items-start gap-3 rounded-2xl border bg-white p-4"><div className={`mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center ${item.urgency === 'urgent_redirect' ? 'bg-red-100 text-red-700' : item.urgency === 'priority' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}><Stethoscope className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{statusLabels[item.status] || item.status} · aberto em {formatDate(item.created_at)}</p></div><ChevronRight className="mt-2 h-4 w-4 text-muted-foreground" /></Link>)}</div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center gap-2"><Target className="h-5 w-5 text-emerald-700" /><h2 className="font-bold">Plano de ação</h2></div>
          {openActions.length === 0 ? <Empty text="Nenhuma ação aberta." /> : <div className="space-y-2">{openActions.slice(0, 8).map((item) => <div key={item.id} className="rounded-2xl border bg-white p-4"><div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-slate-400" /><div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.status}{item.due_date ? ` · prazo ${formatDate(item.due_date)}` : ''}{item.priority === 'high' ? ' · prioridade' : ''}</p></div></div></div>)}</div>}
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-700" /><h2 className="font-bold">Alertas operacionais</h2></div>
          {alerts.length === 0 ? <Empty text="Nenhum alerta aberto." /> : <div className="space-y-2">{alerts.slice(0, 8).map((item) => <div key={item.id} className={`rounded-2xl border p-4 ${item.severity === 'high' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.source} · {formatDate(item.created_at)}</p></div>)}</div>}
        </div>
      </section>

      <Link to="/concierge/ops" className="flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white"><ClipboardList className="h-4 w-4" /> Voltar à fila Concierge</Link>
    </div>
  )
}

function Stat({ label, value, attention = false }: { label: string; value: number; attention?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${attention ? 'border-amber-200 bg-amber-50' : 'bg-white'}`}><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>
}

function TeamCard({ label, member }: { label: string; member?: any }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-sm font-bold">{member?.professional_name || 'Não atribuído'}</p>{member?.specialty && <p className="mt-1 text-xs text-muted-foreground">{member.specialty}</p>}</div>
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed bg-white p-5 text-center text-sm text-muted-foreground">{text}</div>
}
