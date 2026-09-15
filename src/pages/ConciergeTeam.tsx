import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, MessageCircle, ShieldCheck, Stethoscope, UserRound } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { listMyConciergeTeam } from '@/services/concierge'

const roleLabels: Record<string, string> = {
  nurse: 'Enfermeira de referência',
  doctor: 'Médico de referência',
  care_coordinator: 'Coordenador de cuidado',
  specialist: 'Especialista parceiro',
}

export default function ConciergeTeam() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [team, setTeam] = useState<any[]>([])
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
      setTeam(await listMyConciergeTeam(user.id))
    } catch (error) {
      console.warn('Concierge team unavailable:', error)
      setUnavailable(true)
      setTeam([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-emerald-800 to-cyan-800 p-5 text-white">
        <button type="button" onClick={() => navigate('/concierge')} className="mb-4 flex items-center gap-2 text-sm text-white/80"><ArrowLeft className="h-4 w-4" /> Concierge</button>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/70"><ShieldCheck className="h-4 w-4" /> Continuidade de cuidado</div>
        <h1 className="mt-2 text-2xl font-bold">Minha Equipe</h1>
        <p className="mt-2 text-sm text-white/80">Profissionais de referência que acompanham sua jornada e coordenam os próximos passos.</p>
      </section>

      {unavailable && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">A equipe Concierge será exibida quando o módulo for ativado no banco de validação.</div>}

      {!unavailable && team.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-white p-6 text-center">
          <UserRound className="mx-auto h-9 w-9 text-emerald-600" />
          <p className="mt-3 font-semibold">Equipe ainda não atribuída</p>
          <p className="mt-1 text-sm text-muted-foreground">No piloto, cada paciente poderá receber uma enfermeira e um médico de referência.</p>
        </div>
      )}

      <div className="space-y-3">
        {team.map((member) => (
          <div key={member.id} className="rounded-2xl border bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center"><Stethoscope className="h-6 w-6" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><p className="font-bold truncate">{member.professional_name || 'Profissional da equipe'}</p>{member.is_primary && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">REFERÊNCIA</span>}</div>
                <p className="mt-1 text-sm text-muted-foreground">{roleLabels[member.role] || member.role}</p>
                {member.specialty && <p className="mt-1 text-xs text-muted-foreground">{member.specialty}</p>}
              </div>
            </div>
            <Link to="/concierge/request?category=guidance" className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"><MessageCircle className="h-4 w-4" /> Conversar com minha equipe</Link>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">A conversa vira um caso acompanhado, com histórico e próximos passos.</p>
          </div>
        ))}
      </div>

      <Link to="/concierge/consent" className="block rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" /> Acesso do Concierge</div>
        <p className="mt-1 text-xs leading-relaxed text-blue-900/75">Revise as categorias autorizadas ou revogue o acesso da equipe a qualquer momento.</p>
      </Link>

      <Link to="/care-links" className="block rounded-2xl border bg-slate-50 p-4 text-sm text-slate-700">
        Seus outros vínculos e autorizações profissionais continuam sob seu controle. Toque aqui para gerenciar permissões fora do Concierge.
      </Link>
    </div>
  )
}
