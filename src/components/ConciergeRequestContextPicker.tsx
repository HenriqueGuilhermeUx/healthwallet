import { useEffect, useMemo, useState } from 'react'
import { Check, FileText, Loader2, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type FamilyMember = {
  id: string
  name: string
  relationship?: string | null
}

type ExamReference = {
  id: string
  file_name?: string | null
  exam_type?: string | null
  exam_date?: string | null
  created_at?: string | null
}

type Props = {
  userId: string
  showFamily: boolean
  showExams: boolean
  selectedFamilyMemberId: string
  onFamilyMemberChange: (value: { id: string; name: string; relationship: string } | null) => void
  selectedExamIds: string[]
  onExamsChange: (ids: string[], references: ExamReference[]) => void
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(`${value.length === 10 ? `${value}T12:00:00` : value}`)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR')
}

export default function ConciergeRequestContextPicker({
  userId,
  showFamily,
  showExams,
  selectedFamilyMemberId,
  onFamilyMemberChange,
  selectedExamIds,
  onExamsChange,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [family, setFamily] = useState<FamilyMember[]>([])
  const [exams, setExams] = useState<ExamReference[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [familyRes, examsRes] = await Promise.all([
          supabase
            .from('family_members')
            .select('id,name,relationship')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(30),
          supabase
            .from('medical_records')
            .select('id,file_name,exam_type,exam_date,created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20),
        ])

        if (!cancelled) {
          setFamily(familyRes.data || [])
          setExams(examsRes.data || [])
        }
      } catch (error) {
        console.warn('Concierge request references unavailable:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [userId])

  const selectedExamSet = useMemo(() => new Set(selectedExamIds), [selectedExamIds])

  function selectFamily(id: string) {
    const member = family.find((item) => item.id === id)
    if (!member) {
      onFamilyMemberChange(null)
      return
    }
    onFamilyMemberChange({
      id: member.id,
      name: member.name,
      relationship: member.relationship || 'Familiar',
    })
  }

  function toggleExam(exam: ExamReference) {
    const nextIds = selectedExamSet.has(exam.id)
      ? selectedExamIds.filter((id) => id !== exam.id)
      : [...selectedExamIds, exam.id].slice(-8)
    const references = exams.filter((item) => nextIds.includes(item.id))
    onExamsChange(nextIds, references)
  }

  if (loading && (showFamily || showExams)) {
    return <div className="rounded-2xl border bg-white p-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando seus registros...</div>
  }

  return (
    <>
      {showFamily && family.length > 0 && (
        <section className="rounded-2xl border bg-white p-4">
          <div className="flex items-center gap-2"><Users className="h-5 w-5 text-emerald-700" /><h2 className="font-bold">Escolha quem da família</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">Use um perfil familiar que já existe na sua HealthWallet. Não criamos uma cópia.</p>
          <select value={selectedFamilyMemberId} onChange={(event) => selectFamily(event.target.value)} className="mt-3 w-full rounded-xl border bg-white px-3 py-3 text-sm">
            <option value="">Selecionar familiar</option>
            {family.map((member) => <option key={member.id} value={member.id}>{member.name}{member.relationship ? ` · ${member.relationship}` : ''}</option>)}
          </select>
        </section>
      )}

      {showExams && exams.length > 0 && (
        <section className="rounded-2xl border bg-white p-4">
          <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-700" /><h2 className="font-bold">Relacionar exames deste caso</h2></div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Selecione apenas referências dos exames que já estão na HealthWallet. O arquivo continua no cofre original.</p>
          <div className="mt-3 space-y-2">
            {exams.map((exam) => {
              const selected = selectedExamSet.has(exam.id)
              return (
                <button key={exam.id} type="button" onClick={() => toggleExam(exam)} className={`w-full rounded-xl border p-3 text-left ${selected ? 'border-emerald-300 bg-emerald-50' : 'bg-white'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 h-5 w-5 rounded-md border flex items-center justify-center ${selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>{selected && <Check className="h-3.5 w-3.5" />}</div>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{exam.exam_type || exam.file_name || 'Exame'}</p><p className="mt-1 text-xs text-muted-foreground">{exam.file_name || 'Documento clínico'}{(exam.exam_date || exam.created_at) ? ` · ${formatDate(exam.exam_date || exam.created_at)}` : ''}</p></div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}
