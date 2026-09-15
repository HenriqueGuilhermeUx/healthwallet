import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarPlus, CheckCircle2, Clock, Loader2, MessageSquareText, Send, Stethoscope } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import {
  addStaffEvent,
  createConciergeAction,
  getConciergeRequest,
  getConciergeStaffSelf,
  listConciergeRequestEvents,
  updateConciergeRequestStatus,
} from '@/services/concierge'
import { logConciergeWork } from '@/services/conciergeAnalytics'
import ConciergeClinicalReviewPanel from '@/components/ConciergeClinicalReviewPanel'
import ConciergeAuthorizedContextPanel from '@/components/ConciergeAuthorizedContextPanel'
import ConciergeProgramAssignmentPanel from '@/components/ConciergeProgramAssignmentPanel'
import { supabase } from '@/lib/supabase'

function formatDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function ConciergeCase() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState<any>(null)
  const [request, setRequest] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [actions, setActions] = useState<any[]>([])
  const [note, setNote] = useState('')
  const [noteVisibility, setNoteVisibility] = useState<'patient' | 'staff_only'>('patient')
  const [workMinutes, setWorkMinutes] = useState('')
  const [workType, setWorkType] = useState<'triage' | 'message' | 'clinical_review' | 'care_coordination' | 'action_plan' | 'follow_up' | 'teleconsult' | 'other'>('care_coordination')
  const [actionTitle, setActionTitle] = useState('')
  const [actionDueDate, setActionDueDate] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user || !id) return
    void load()
  }, [user?.id, id])

  async function load() {
    if (!user) return
    setLoading(true)
    try {
      const staffData = await getConciergeStaffSelf(user.id)
      if (!staffData?.active) {
        setStaff(null)
        return
      }
      setStaff(staffData)
      const requestData = await getConciergeRequest(id)
      setRequest(requestData)
      const [eventData, actionRes] = await Promise.all([
        listConciergeRequestEvents(id),
        supabase.from('concierge_actions').select('*').eq('request_id', id).order('created_at', { ascending: false }),
      ])
      setEvents(eventData)
      setActions(actionRes.data || [])
    } catch (error) {
      console.error('Concierge case failed:', error)
      toast.error('Não foi possível carregar o caso.')
    } finally {
      setLoading(false)
    }
  }

  const patientTimeline = useMemo(() => events.filter((item) => item.visibility === 'patient'), [events])
  const staffNotes = useMemo(() => events.filter((item) => item.visibility === 'staff_only'), [events])

  async function addNote() {
    if (!staff || !request || !note.trim()) return
    setBusy(true)
    try {
      await addStaffEvent(request.id, request.patient_id, staff, 'case_note', note.trim(), noteVisibility)

      const minutes = Number(workMinutes)
      if (Number.isFinite(minutes) && minutes > 0) {
        try {
          await logConciergeWork({
            staffUserId: staff.user_id,
            patientId: request.patient_id,
            requestId: request.id,
            staffRole: staff.role,
            workType,
            durationMinutes: minutes,
            outcome: noteVisibility === 'patient' ? 'patient_update' : 'internal_coordination',
          })
        } catch (workError) {
          console.warn('Work log unavailable until pilot analytics migration is active:', workError)
        }
      }

      setNote('')
      setWorkMinutes('')
      toast.success(noteVisibility === 'patient' ? 'Atualização enviada ao paciente' : 'Nota interna registrada')
      await load()
    } catch (error) {
      console.error('Case note failed:', error)
      toast.error('Não foi possível registrar a nota.')
    } finally {
      setBusy(false)
    }
  }

  async function createAction() {
    if (!staff || !request || !actionTitle.trim()) return
    setBusy(true)
    try {
      const title = actionTitle.trim()
      await createConciergeAction({
        patientId: request.patient_id,
        requestId: request.id,
        createdBy: staff.user_id,
        title,
        dueDate: actionDueDate || undefined,
        priority: request.urgency === 'priority' ? 'high' : 'normal',
      })
      await addStaffEvent(request.id, request.patient_id, staff, 'action_created', `Novo próximo passo: ${title}.`)
      if (!['action_plan', 'resolved', 'closed'].includes(request.status)) {
        await updateConciergeRequestStatus(
          request,
          staff,
          'action_plan',
          'A equipe criou um plano de ação para acompanhar os próximos passos.',
        )
      }
      setActionTitle('')
      setActionDueDate('')
      toast.success('Ação adicionada ao plano do paciente')
      await load()
    } catch (error) {
      console.error('Create action failed:', error)
      toast.error('Não foi possível criar a ação.')
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(status: any, message: string) {
    if (!staff || !request) return
    setBusy(true)
    try {
      await updateConciergeRequestStatus(request, staff, status, message)
      toast.success('Caso atualizado')
      await load()
    } catch (error) {
      console.error('Case status failed:', error)
      toast.error('Não foi possível atualizar o caso.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>

  if (!staff) return <div className="rounded-2xl border bg-white p-6 text-center text-sm text-muted-foreground">Acesso restrito à equipe Concierge.</div>
  if (!request) return <div className="rounded-2xl border bg-white p-6 text-center text-sm text-muted-foreground">Caso não encontrado.</div>

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-slate-950 p-5 text-white">
        <button type="button" onClick={() => navigate('/concierge/ops')} className="mb-4 flex items-center gap-2 text-sm text-white/70"><ArrowLeft className="h-4 w-4" /> Fila Concierge</button>
        <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white/10 px-2 py-1">{request.category}</span><span className="rounded-full bg-white/10 px-2 py-1">{request.status}</span><span className="rounded-full bg-white/10 px-2 py-1">{request.urgency}</span></div>
        <h1 className="mt-3 text-2xl font-bold">{request.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/80">{request.description}</p>
        {request.subject_name && <p className="mt-3 text-xs text-white/60">Pessoa acompanhada: {request.subject_name} · {request.subject_relationship || 'familiar'}</p>}
        <p className="mt-3 flex items-center gap-1 text-xs text-white/50"><Clock className="h-3.5 w-3.5" /> {formatDate(request.created_at)}</p>
      </section>

      {request.context_snapshot?.medscore && (
        <section className="rounded-2xl border bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Contexto capturado na abertura</p>
          <p className="mt-2 text-2xl font-bold">MedScore {request.context_snapshot.medscore.score}/100</p>
          <p className="mt-1 text-xs text-muted-foreground">Snapshot de contexto; não substitui revisão clínica do histórico autorizado.</p>
        </section>
      )}

      <ConciergeAuthorizedContextPanel requestId={request.id} />

      <ConciergeClinicalReviewPanel request={request} staff={staff} onSaved={load} />

      <section className="rounded-2xl border bg-white p-4">
        <h2 className="font-bold">Fluxo assistencial</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button disabled={busy} onClick={() => changeStatus('in_triage', 'A equipe iniciou a triagem da solicitação.')} className="rounded-xl border px-3 py-3 text-xs font-bold">Em triagem</button>
          <button disabled={busy} onClick={() => changeStatus('waiting_patient', 'A equipe precisa de uma informação adicional do paciente.')} className="rounded-xl border px-3 py-3 text-xs font-bold">Aguardar paciente</button>
          <button disabled={busy || staff.role === 'doctor'} onClick={() => changeStatus('escalated_medical', 'Caso encaminhado para avaliação médica.')} className="rounded-xl bg-emerald-700 px-3 py-3 text-xs font-bold text-white disabled:opacity-50">Encaminhar médico</button>
          <button disabled={busy} onClick={() => changeStatus('resolved', 'Caso concluído pela equipe Concierge. Os próximos passos permanecem no Plano de Ação.')} className="rounded-xl bg-slate-900 px-3 py-3 text-xs font-bold text-white">Resolver caso</button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-2"><CalendarPlus className="h-5 w-5 text-emerald-700" /><h2 className="font-bold">Criar próximo passo</h2></div>
        <input value={actionTitle} onChange={(event) => setActionTitle(event.target.value)} placeholder="Ex.: realizar hemograma e anexar resultado" className="mt-3 w-full rounded-xl border px-3 py-3 text-sm" />
        <input type="date" value={actionDueDate} onChange={(event) => setActionDueDate(event.target.value)} className="mt-2 w-full rounded-xl border px-3 py-3 text-sm" />
        <button disabled={busy || !actionTitle.trim()} onClick={createAction} className="mt-3 w-full rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 disabled:opacity-50">Adicionar ao Plano de Ação</button>
        {actions.length > 0 && <div className="mt-4 space-y-2">{actions.map((item) => <div key={item.id} className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm"><CheckCircle2 className={`mt-0.5 h-4 w-4 ${item.status === 'completed' ? 'text-emerald-600' : 'text-slate-400'}`} /><div><p className="font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.status}{item.due_date ? ` · prazo ${item.due_date}` : ''}</p></div></div>)}</div>}
      </section>

      <ConciergeProgramAssignmentPanel
        patientId={request.patient_id}
        requestId={request.id}
        staff={staff}
        onChanged={load}
      />

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-emerald-700" /><h2 className="font-bold">Registrar atualização</h2></div>
        <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => setNoteVisibility('patient')} className={`rounded-xl border px-3 py-2 text-xs font-bold ${noteVisibility === 'patient' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : ''}`}>Paciente vê</button><button onClick={() => setNoteVisibility('staff_only')} className={`rounded-xl border px-3 py-2 text-xs font-bold ${noteVisibility === 'staff_only' ? 'border-slate-700 bg-slate-100' : ''}`}>Nota interna</button></div>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Atualização, orientação ou observação de coordenação..." className="mt-3 w-full resize-none rounded-xl border px-3 py-3 text-sm" />

        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">Tempo real gasto nesta interação</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Usado apenas para medir capacidade operacional e unit economics do piloto.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input type="number" min="1" max="480" value={workMinutes} onChange={(event) => setWorkMinutes(event.target.value)} placeholder="Minutos" className="rounded-xl border bg-white px-3 py-2.5 text-sm" />
            <select value={workType} onChange={(event) => setWorkType(event.target.value as any)} className="rounded-xl border bg-white px-3 py-2.5 text-sm">
              <option value="triage">Triagem</option>
              <option value="message">Mensagem</option>
              <option value="clinical_review">Revisão clínica</option>
              <option value="care_coordination">Coordenação</option>
              <option value="action_plan">Plano de ação</option>
              <option value="follow_up">Follow-up</option>
              <option value="teleconsult">Teleconsulta</option>
              <option value="other">Outro</option>
            </select>
          </div>
        </div>

        <button disabled={busy || !note.trim()} onClick={addNote} className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"><Send className="h-4 w-4" /> Registrar</button>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-emerald-700" /><h2 className="font-bold">Linha do caso</h2></div>
        <div className="mt-4 space-y-4">{patientTimeline.map((item) => <TimelineItem key={item.id} item={item} />)}</div>
      </section>

      {staffNotes.length > 0 && (
        <section className="rounded-2xl border border-slate-300 bg-slate-50 p-4"><h2 className="font-bold">Notas internas da equipe</h2><div className="mt-4 space-y-4">{staffNotes.map((item) => <TimelineItem key={item.id} item={item} />)}</div></section>
      )}

      <Link to="/telemedicine-admin" className="block rounded-2xl border bg-white p-4 text-center text-sm font-bold text-emerald-700">Abrir operação de teleconsulta</Link>
    </div>
  )
}

function TimelineItem({ item }: { item: any }) {
  return <div className="relative pl-5"><span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500" /><p className="text-sm font-medium">{item.message || item.event_type}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(item.created_at)} · {item.actor_role}</p></div>
}
