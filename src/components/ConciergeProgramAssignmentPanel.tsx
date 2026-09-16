import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, HeartPulse, Loader2, PlusCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  assignConciergeProgram,
  listConciergeProgramsForStaff,
  listPatientProgramEnrollments,
} from '@/services/conciergePrograms'
import { addStaffEvent } from '@/services/concierge'

type Props = {
  patientId: string
  requestId: string
  staff: any
  onChanged?: () => void | Promise<void>
}

export default function ConciergeProgramAssignmentPanel({ patientId, requestId, staff, onChanged }: Props) {
  const [loading, setLoading] = useState(true)
  const [programs, setPrograms] = useState<any[]>([])
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [selectedProgramId, setSelectedProgramId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void load()
  }, [patientId])

  async function load() {
    setLoading(true)
    try {
      const [programData, enrollmentData] = await Promise.all([
        listConciergeProgramsForStaff(),
        listPatientProgramEnrollments(patientId),
      ])
      setPrograms(programData)
      setEnrollments(enrollmentData)
    } catch (error) {
      console.warn('Concierge programs unavailable in case workspace:', error)
    } finally {
      setLoading(false)
    }
  }

  const activeIds = useMemo(
    () => new Set(enrollments.filter((item) => item.status === 'active').map((item) => item.program_id)),
    [enrollments],
  )

  const available = useMemo(() => programs.filter((item) => !activeIds.has(item.id)), [programs, activeIds])

  async function assign() {
    if (!selectedProgramId || !staff) return
    const program = programs.find((item) => item.id === selectedProgramId)
    if (!program) return

    setSaving(true)
    try {
      await assignConciergeProgram({ patientId, program, staffUserId: staff.user_id })
      await addStaffEvent(
        requestId,
        patientId,
        staff,
        'program_enrolled',
        `Programa ${program.name} adicionado ao acompanhamento.`,
      )
      setSelectedProgramId('')
      toast.success('Programa adicionado ao acompanhamento')
      await load()
      if (onChanged) await onChanged()
    } catch (error) {
      console.error('Program assignment failed:', error)
      toast.error('Não foi possível adicionar o programa.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <section className="rounded-2xl border bg-white p-4"><Loader2 className="h-5 w-5 animate-spin text-emerald-600" /></section>

  return (
    <section className="rounded-2xl border bg-white p-4">
      <div className="flex items-center gap-2"><HeartPulse className="h-5 w-5 text-emerald-700" /><h2 className="font-bold">Programa de acompanhamento</h2></div>
      <p className="mt-1 text-xs text-muted-foreground">Use quando uma jornada longitudinal fizer sentido. Programas clínicos específicos entram com a equipe, não por autodiagnóstico.</p>

      {enrollments.filter((item) => item.status === 'active').length > 0 && (
        <div className="mt-3 space-y-2">
          {enrollments.filter((item) => item.status === 'active').map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-semibold">{item.concierge_programs?.name || 'Programa ativo'}</span>
            </div>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div className="mt-3 flex gap-2">
          <select value={selectedProgramId} onChange={(event) => setSelectedProgramId(event.target.value)} className="min-w-0 flex-1 rounded-xl border bg-white px-3 py-2.5 text-sm">
            <option value="">Selecionar programa</option>
            {available.map((program) => <option key={program.id} value={program.id}>{program.name}{program.enrollment_mode === 'team' ? ' · equipe' : ''}</option>)}
          </select>
          <button type="button" disabled={!selectedProgramId || saving} onClick={assign} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
          </button>
        </div>
      )}
    </section>
  )
}
