import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, HeartPulse, Loader2, PlusCircle, Stethoscope, Target } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { enrollInConciergeProgram, listConciergePrograms, listMyProgramEnrollments } from '@/services/concierge'

export default function ConciergePrograms() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [programs, setPrograms] = useState<any[]>([])
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (!user) return
    void load()
  }, [user?.id])

  async function load() {
    if (!user) return
    setLoading(true)
    setUnavailable(false)
    try {
      const [programData, enrollmentData] = await Promise.all([
        listConciergePrograms(),
        listMyProgramEnrollments(user.id),
      ])
      setPrograms(programData)
      setEnrollments(enrollmentData)
    } catch (error) {
      console.warn('Concierge programs unavailable:', error)
      setUnavailable(true)
      setPrograms([])
      setEnrollments([])
    } finally {
      setLoading(false)
    }
  }

  const enrolledIds = useMemo(() => new Set(enrollments.filter((item) => item.status === 'active').map((item) => item.program_id)), [enrollments])

  async function enroll(program: any) {
    if (!user) return
    if (program.enrollment_mode === 'team') {
      navigate(`/concierge/request?category=guidance&program_name=${encodeURIComponent(program.name)}`)
      return
    }

    setBusyId(program.id)
    try {
      await enrollInConciergeProgram(user.id, program)
      toast.success(`${program.name} adicionado à sua jornada`)
      await load()
    } catch (error) {
      console.error('Program enrollment failed:', error)
      toast.error('Não foi possível adicionar o programa.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-indigo-900 via-teal-900 to-emerald-700 p-5 text-white">
        <button type="button" onClick={() => navigate('/concierge')} className="mb-4 flex items-center gap-2 text-sm text-white/80"><ArrowLeft className="h-4 w-4" /> Concierge</button>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/70"><Target className="h-4 w-4" /> Programas de acompanhamento</div>
        <h1 className="mt-2 text-2xl font-bold">Jornadas de Saúde</h1>
        <p className="mt-2 text-sm text-white/80">Metas, checklists e acompanhamento organizados ao redor de uma necessidade real — não conteúdo genérico.</p>
      </section>

      {unavailable && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Os programas serão ativados junto com o banco do Concierge na fase de validação.</div>}

      {enrollments.length > 0 && (
        <section>
          <h2 className="mb-3 font-bold text-gray-900">Meus programas</h2>
          <div className="space-y-3">
            {enrollments.filter((item) => item.status === 'active').map((item) => (
              <div key={item.id} className="rounded-2xl border bg-white p-4">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center"><CheckCircle2 className="h-5 w-5" /></div>
                  <div><p className="font-bold">{item.concierge_programs?.name || 'Programa de saúde'}</p><p className="mt-1 text-xs text-muted-foreground">Acompanhamento ativo</p></div>
                </div>
                {Array.isArray(item.goals) && item.goals.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {item.goals.slice(0, 3).map((goal: string, index: number) => <div key={`${item.id}-${index}`} className="flex gap-2 text-sm"><span className="text-emerald-600">•</span><span>{goal}</span></div>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-bold text-gray-900">Programas disponíveis</h2>
        <div className="space-y-3">
          {programs.map((program) => {
            const enrolled = enrolledIds.has(program.id)
            const teamEnrollment = program.enrollment_mode === 'team'
            return (
              <div key={program.id} className="rounded-2xl border bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 flex-shrink-0 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center"><HeartPulse className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-bold text-gray-900">{program.name}</p>{teamEnrollment && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">COM EQUIPE</span>}</div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{program.description}</p>
                    {program.target && <p className="mt-2 text-xs text-slate-500">Para: {program.target}</p>}
                    {teamEnrollment && <p className="mt-2 text-xs text-blue-800">A entrada neste programa é combinada com sua equipe de referência para evitar transformar uma condição clínica em autoinscrição.</p>}
                  </div>
                </div>
                <button type="button" disabled={enrolled || busyId === program.id} onClick={() => enroll(program)} className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 ${enrolled ? 'bg-emerald-50 text-emerald-700' : teamEnrollment ? 'bg-blue-50 text-blue-800' : 'bg-slate-900 text-white'} disabled:opacity-70`}>
                  {busyId === program.id ? <Loader2 className="h-4 w-4 animate-spin" /> : enrolled ? <CheckCircle2 className="h-4 w-4" /> : teamEnrollment ? <Stethoscope className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
                  {enrolled ? 'Programa ativo' : teamEnrollment ? 'Conversar com minha equipe' : 'Adicionar à minha jornada'}
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
