import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, BellRing, ChevronRight, HeartHandshake, Loader2, Pill, Plus, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

type FamilyMember = {
  id: string
  name: string
  relationship?: string | null
  is_elderly?: boolean | null
  is_caregiver?: boolean | null
  emergency_contact?: boolean | null
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function ConciergeFamily() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [reminders, setReminders] = useState<any[]>([])
  const [medications, setMedications] = useState<any[]>([])

  useEffect(() => {
    if (!user) return
    void load()
  }, [user?.id])

  async function load() {
    if (!user) return
    setLoading(true)
    try {
      const [familyRes, reminderRes, medicationRes] = await Promise.all([
        supabase
          .from('family_members')
          .select('id,name,relationship,is_elderly,is_caregiver,emergency_contact')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('health_reminders')
          .select('id,target_family_member_id,title,reminder_date,is_done,is_active')
          .eq('user_id', user.id)
          .eq('is_active', true),
        supabase
          .from('medications')
          .select('id,target_family_member_id,name,is_active,critical_medication')
          .eq('user_id', user.id)
          .eq('is_active', true),
      ])

      setMembers(familyRes.data || [])
      setReminders(reminderRes.data || [])
      setMedications(medicationRes.data || [])
    } catch (error) {
      console.warn('Concierge family coordination unavailable:', error)
    } finally {
      setLoading(false)
    }
  }

  const today = todayIso()
  const overview = useMemo(() => members.map((member) => {
    const memberReminders = reminders.filter((item) => item.target_family_member_id === member.id && !item.is_done)
    const overdue = memberReminders.filter((item) => item.reminder_date && item.reminder_date < today)
    const memberMedications = medications.filter((item) => item.target_family_member_id === member.id)
    const criticalMedications = memberMedications.filter((item) => item.critical_medication)
    return { member, reminders: memberReminders, overdue, medications: memberMedications, criticalMedications }
  }), [members, reminders, medications, today])

  const attentionCount = overview.filter((item) => item.overdue.length > 0).length

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-emerald-950 to-teal-800 p-5 text-white">
        <button type="button" onClick={() => navigate('/concierge')} className="mb-4 flex items-center gap-2 text-sm text-white/70"><ArrowLeft className="h-4 w-4" /> Concierge</button>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/60"><HeartHandshake className="h-4 w-4" /> Coordenação familiar</div>
        <h1 className="mt-2 text-2xl font-bold">Minha Família</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/75">Acompanhe pendências reais dos perfis que você já organiza na HealthWallet e peça ajuda para qualquer membro quando precisar.</p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Stat label="Pessoas acompanhadas" value={members.length} />
        <Stat label="Precisam atenção" value={attentionCount} attention={attentionCount > 0} />
      </section>

      {members.length === 0 ? (
        <section className="rounded-2xl border border-dashed bg-white p-6 text-center">
          <Users className="mx-auto h-9 w-9 text-emerald-700" />
          <p className="mt-3 font-bold">Comece pelo seu círculo de cuidado</p>
          <p className="mt-1 text-sm text-muted-foreground">Cadastre filhos, pais, parceiro(a) ou pessoas que você ajuda a cuidar na HealthWallet.</p>
          <Link to="/family" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Adicionar familiar</Link>
        </section>
      ) : (
        <section className="space-y-3">
          {overview.map(({ member, reminders: memberReminders, overdue, medications: memberMedications, criticalMedications }) => (
            <article key={member.id} className={`rounded-2xl border bg-white p-4 ${overdue.length ? 'border-amber-300' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center"><Users className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-bold truncate">{member.name}</p>{member.is_elderly && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold">IDOSO</span>}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{member.relationship || 'Familiar'}</p>
                </div>
                {overdue.length > 0 && <AlertTriangle className="h-5 w-5 text-amber-600" />}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-1 text-xs text-slate-600"><BellRing className="h-3.5 w-3.5" /> Pendências</div><p className="mt-1 text-xl font-bold">{memberReminders.length}</p>{overdue.length > 0 && <p className="mt-1 text-[10px] font-semibold text-amber-700">{overdue.length} vencida(s)</p>}</div>
                <div className="rounded-xl bg-violet-50 p-3"><div className="flex items-center gap-1 text-xs text-violet-700"><Pill className="h-3.5 w-3.5" /> Medicações</div><p className="mt-1 text-xl font-bold">{memberMedications.length}</p>{criticalMedications.length > 0 && <p className="mt-1 text-[10px] font-semibold text-violet-700">{criticalMedications.length} marcada(s) crítica(s)</p>}</div>
              </div>

              <Link to={`/concierge/request?category=guidance&family_member=${encodeURIComponent(member.id)}`} className="mt-4 flex w-full items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"><span>Pedir ajuda para {member.name.split(' ')[0]}</span><ChevronRight className="h-4 w-4" /></Link>
            </article>
          ))}
        </section>
      )}

      <Link to="/family" className="block rounded-2xl border bg-white p-4 text-center text-sm font-bold text-emerald-700">Gerenciar perfis, cuidadores e contatos na HealthWallet</Link>

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">O Concierge não cria uma segunda ficha familiar. Ele coordena os registros já existentes na HealthWallet e respeita as autorizações do titular.</p>
    </div>
  )
}

function Stat({ label, value, attention = false }: { label: string; value: number; attention?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${attention ? 'border-amber-200 bg-amber-50' : 'bg-white'}`}><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>
}
