import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileSearch, Loader2, Save, Stethoscope } from 'lucide-react'
import { toast } from 'sonner'
import {
  getConciergeClinicalReview,
  saveConciergeClinicalReview,
  updateConciergeRequestStatus,
} from '@/services/concierge'

type Props = {
  request: any
  staff?: any
  patientMode?: boolean
  onSaved?: () => void | Promise<void>
}

const reviewCategories = new Set(['second_analysis', 'exam_review', 'medication_review'])

export default function ConciergeClinicalReviewPanel({ request, staff, patientMode = false, onSaved }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [review, setReview] = useState<any>(null)
  const [caseSummary, setCaseSummary] = useState('')
  const [relevantFindings, setRelevantFindings] = useState('')
  const [pointsToConsider, setPointsToConsider] = useState('')
  const [uncertainties, setUncertainties] = useState('')
  const [recommendations, setRecommendations] = useState('')
  const [nextSteps, setNextSteps] = useState('')
  const [questionsForPatient, setQuestionsForPatient] = useState('')

  const enabled = reviewCategories.has(request?.category) || request?.status === 'medical_review'
  const canPublish = ['doctor', 'admin'].includes(staff?.role)

  const reviewType = useMemo(() => {
    if (request?.category === 'second_analysis') return 'second_analysis'
    if (request?.category === 'exam_review') return 'exam_review'
    if (request?.category === 'medication_review') return 'medication_review'
    return 'medical_review'
  }, [request?.category])

  useEffect(() => {
    if (!request?.id || !enabled) {
      setLoading(false)
      return
    }
    void load()
  }, [request?.id, enabled])

  async function load() {
    setLoading(true)
    try {
      const data = await getConciergeClinicalReview(request.id)
      setReview(data)
      setCaseSummary(data?.case_summary || '')
      setRelevantFindings(data?.relevant_findings || '')
      setPointsToConsider(data?.points_to_consider || '')
      setUncertainties(data?.uncertainties || '')
      setRecommendations(data?.recommendations || '')
      setNextSteps(data?.next_steps || '')
      setQuestionsForPatient(data?.questions_for_patient || '')
    } catch (error) {
      console.warn('Clinical review not available yet:', error)
      setReview(null)
    } finally {
      setLoading(false)
    }
  }

  async function save(status: 'draft' | 'ready_for_physician' | 'completed') {
    if (!staff || !request) return
    if (status === 'completed' && !canPublish) {
      toast.error('A publicação da revisão requer médico responsável.')
      return
    }
    if (!caseSummary.trim() && !nextSteps.trim()) {
      toast.error('Registre pelo menos um resumo ou os próximos passos.')
      return
    }

    setSaving(true)
    try {
      const saved = await saveConciergeClinicalReview({
        requestId: request.id,
        patientId: request.patient_id,
        reviewType,
        status,
        patientVisible: status === 'completed',
        caseSummary: caseSummary.trim(),
        relevantFindings: relevantFindings.trim(),
        pointsToConsider: pointsToConsider.trim(),
        uncertainties: uncertainties.trim(),
        recommendations: recommendations.trim(),
        nextSteps: nextSteps.trim(),
        questionsForPatient: questionsForPatient.trim(),
      })
      setReview(saved)

      if (status === 'ready_for_physician') {
        await updateConciergeRequestStatus(
          request,
          staff,
          'escalated_medical',
          'Caso estruturado pela equipe e encaminhado para revisão médica.',
        )
        toast.success('Preparação salva e encaminhada ao médico')
      } else if (status === 'completed') {
        await updateConciergeRequestStatus(
          request,
          staff,
          'action_plan',
          'Revisão profissional concluída. Próximos passos registrados no caso.',
        )
        toast.success('Revisão concluída e liberada ao paciente')
      } else {
        toast.success('Rascunho salvo')
      }

      if (onSaved) await onSaved()
    } catch (error: any) {
      console.error('Clinical review save failed:', error)
      toast.error(error?.message || 'Não foi possível salvar a revisão.')
    } finally {
      setSaving(false)
    }
  }

  if (!enabled) return null
  if (loading) return <div className="rounded-2xl border bg-white p-4"><Loader2 className="h-5 w-5 animate-spin text-emerald-600" /></div>

  if (patientMode) {
    if (!review || review.status !== 'completed' || !review.patient_visible) return null
    return (
      <section className="rounded-2xl border border-emerald-200 bg-white p-4">
        <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-700" /><h2 className="font-bold">Revisão da sua equipe</h2></div>
        <div className="mt-4 space-y-4 text-sm">
          <ReviewBlock title="Resumo" value={review.case_summary} />
          <ReviewBlock title="Achados relevantes" value={review.relevant_findings} />
          <ReviewBlock title="Pontos a considerar" value={review.points_to_consider} />
          <ReviewBlock title="Incertezas / limitações" value={review.uncertainties} />
          <ReviewBlock title="Orientações" value={review.recommendations} />
          <ReviewBlock title="Próximos passos" value={review.next_steps} />
        </div>
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-muted-foreground">{review.disclaimer}</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-emerald-200 bg-white p-4">
      <div className="flex items-center gap-2">
        {canPublish ? <Stethoscope className="h-5 w-5 text-emerald-700" /> : <FileSearch className="h-5 w-5 text-emerald-700" />}
        <div>
          <h2 className="font-bold">Revisão estruturada</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{canPublish ? 'O médico pode revisar e publicar ao paciente.' : 'A equipe prepara o caso; conclusão clínica é publicada por médico.'}</p>
        </div>
      </div>

      {review?.status && <div className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">Status: {review.status}</div>}

      <div className="mt-4 grid gap-3">
        <Field label="Resumo do caso" value={caseSummary} setValue={setCaseSummary} placeholder="Organize o motivo da revisão e o contexto relevante." />
        <Field label="Achados relevantes" value={relevantFindings} setValue={setRelevantFindings} placeholder="Registre somente dados relevantes para esta revisão." />
        <Field label="Pontos a considerar" value={pointsToConsider} setValue={setPointsToConsider} placeholder="Possibilidades ou aspectos que merecem consideração profissional." />
        <Field label="Incertezas / limitações" value={uncertainties} setValue={setUncertainties} placeholder="O que ainda não está claro? Que informação falta?" />
        <Field label="Orientações" value={recommendations} setValue={setRecommendations} placeholder="Orientações do profissional, dentro do escopo e contexto do atendimento." />
        <Field label="Próximos passos" value={nextSteps} setValue={setNextSteps} placeholder="Exames, retorno, monitoramento, consulta ou outra ação." />
        <Field label="Perguntas para o paciente" value={questionsForPatient} setValue={setQuestionsForPatient} placeholder="Informações adicionais necessárias." />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button type="button" disabled={saving} onClick={() => save('draft')} className="rounded-xl border px-3 py-3 text-xs font-bold flex items-center justify-center gap-1"><Save className="h-4 w-4" /> Rascunho</button>
        {!canPublish && <button type="button" disabled={saving} onClick={() => save('ready_for_physician')} className="rounded-xl bg-emerald-700 px-3 py-3 text-xs font-bold text-white">Enviar ao médico</button>}
        {canPublish && <button type="button" disabled={saving} onClick={() => save('completed')} className="rounded-xl bg-emerald-700 px-3 py-3 text-xs font-bold text-white">Concluir e publicar</button>}
      </div>
    </section>
  )
}

function Field({ label, value, setValue, placeholder }: { label: string; value: string; setValue: (value: string) => void; placeholder: string }) {
  return <label className="text-xs font-semibold text-slate-700">{label}<textarea value={value} onChange={(event) => setValue(event.target.value)} rows={3} placeholder={placeholder} className="mt-1.5 w-full resize-none rounded-xl border px-3 py-2.5 text-sm font-normal text-gray-900" /></label>
}

function ReviewBlock({ title, value }: { title: string; value?: string | null }) {
  if (!value) return null
  return <div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">{title}</p><p className="mt-1 whitespace-pre-wrap leading-relaxed text-gray-800">{value}</p></div>
}
