import { useState } from 'react'
import { Activity, FileText, HeartPulse, Loader2, LockKeyhole, Pill } from 'lucide-react'
import { toast } from 'sonner'
import { getConciergeRequestContext } from '@/services/conciergeContext'

type Props = { requestId: string }

export default function ConciergeAuthorizedContextPanel({ requestId }: Props) {
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [context, setContext] = useState<any>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await getConciergeRequestContext(requestId)
      setContext(data)
      setLoaded(true)
    } catch (error: any) {
      console.error('Authorized Concierge context unavailable:', error)
      toast.error(error?.message?.includes('consent')
        ? 'O paciente precisa manter o consentimento do Concierge ativo.'
        : 'Não foi possível carregar o contexto autorizado deste caso.')
    } finally {
      setLoading(false)
    }
  }

  if (!loaded) {
    return (
      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-700" />
          <div className="flex-1">
            <h2 className="font-bold text-blue-950">Contexto autorizado do caso</h2>
            <p className="mt-1 text-xs leading-relaxed text-blue-900/75">Carregue somente quando precisar revisar o caso. O acesso respeita o escopo autorizado pelo paciente e fica registrado.</p>
            <button disabled={loading} onClick={load} className="mt-3 rounded-xl bg-blue-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50 flex items-center gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} Carregar contexto autorizado
            </button>
          </div>
        </div>
      </section>
    )
  }

  const medications = Array.isArray(context?.active_medications) ? context.active_medications : []
  const exams = Array.isArray(context?.linked_exams) ? context.linked_exams : []
  const deviceRows = Array.isArray(context?.recent_device_summaries) ? context.recent_device_summaries : []
  const latestDevice = deviceRows[0] || null
  const score = context?.medscore?.score

  return (
    <section className="rounded-2xl border border-blue-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-blue-700" /><h2 className="font-bold">Contexto autorizado</h2></div><p className="mt-1 text-xs text-muted-foreground">Escopo ligado a este caso · acesso auditado</p></div>
        <button onClick={load} disabled={loading} className="text-xs font-semibold text-blue-700">Atualizar</button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-emerald-50 p-3"><div className="flex items-center gap-1 text-xs text-emerald-800"><HeartPulse className="h-4 w-4" /> MedScore</div><p className="mt-1 text-xl font-bold">{score ?? '—'}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-1 text-xs text-slate-700"><Activity className="h-4 w-4" /> Dados contínuos</div><p className="mt-1 text-xl font-bold">{deviceRows.length ? `${deviceRows.length}d` : '—'}</p></div>
      </div>

      {latestDevice && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
          <p className="font-semibold">Último resumo de dispositivo</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
            {latestDevice.summary_date && <span>{latestDevice.summary_date}</span>}
            {latestDevice.steps != null && <span>{latestDevice.steps} passos</span>}
            {latestDevice.sleep_minutes != null && <span>{latestDevice.sleep_minutes} min sono</span>}
            {latestDevice.avg_heart_rate != null && <span>FC {latestDevice.avg_heart_rate}</span>}
            {latestDevice.weight_kg != null && <span>{latestDevice.weight_kg} kg</span>}
          </div>
        </div>
      )}

      {medications.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2"><Pill className="h-4 w-4 text-violet-700" /><p className="text-sm font-bold">Medicamentos ativos</p></div>
          <div className="mt-2 space-y-2">{medications.slice(0, 10).map((item: any) => <div key={item.id} className="rounded-xl bg-violet-50 p-3 text-sm"><p className="font-semibold">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{[item.dosage, item.frequency].filter(Boolean).join(' · ') || 'Sem posologia estruturada'}</p></div>)}</div>
        </div>
      )}

      {exams.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-teal-700" /><p className="text-sm font-bold">Exames relacionados pelo paciente</p></div>
          <div className="mt-2 space-y-2">{exams.map((item: any) => <div key={item.id} className="rounded-xl bg-teal-50 p-3"><p className="text-sm font-semibold">{item.exam_type || item.file_name || 'Exame'}</p><p className="mt-1 text-xs text-muted-foreground">{[item.exam_date, item.laboratory].filter(Boolean).join(' · ')}</p>{item.ai_analysis && <p className="mt-2 text-xs leading-relaxed text-slate-700">{item.ai_analysis}</p>}</div>)}</div>
        </div>
      )}

      {!medications.length && !exams.length && !deviceRows.length && score == null && (
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-muted-foreground">O paciente autorizou o Concierge, mas não há contexto adicional disponível para este caso.</p>
      )}
    </section>
  )
}
