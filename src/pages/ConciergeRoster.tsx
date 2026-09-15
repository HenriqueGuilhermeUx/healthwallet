import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { getConciergeStaffSelf } from '@/services/concierge'
import { supabase } from '@/lib/supabase'

export default function ConciergeRoster() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [staffSelf, setStaffSelf] = useState<any>(null)
  const [memberships, setMemberships] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [patientId, setPatientId] = useState('')
  const [patientName, setPatientName] = useState('')
  const [patientEmail, setPatientEmail] = useState('')
  const [hasHealthPlan, setHasHealthPlan] = useState('unknown')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    void load()
  }, [user?.id])

  async function load() {
    if (!user) return
    setLoading(true)
    try {
      const me = await getConciergeStaffSelf(user.id)
      setStaffSelf(me)
      if (!me?.active || !['admin', 'care_coordinator'].includes(me.role)) return

      const [membershipRes, staffRes, assignmentRes] = await Promise.all([
        supabase.from('concierge_memberships').select('*').in('status', ['pilot', 'active', 'paused']).order('created_at', { ascending: false }),
        supabase.from('concierge_staff').select('*').eq('active', true).order('display_name', { ascending: true }),
        supabase.from('concierge_assignments').select('*').eq('status', 'active').order('created_at', { ascending: true }),
      ])

      if (membershipRes.error) throw membershipRes.error
      if (staffRes.error) throw staffRes.error
      if (assignmentRes.error) throw assignmentRes.error

      setMemberships(membershipRes.data || [])
      setStaff(staffRes.data || [])
      setAssignments(assignmentRes.data || [])
    } catch (error) {
      console.error('Concierge roster unavailable:', error)
    } finally {
      setLoading(false)
    }
  }

  const nurses = useMemo(() => staff.filter((item) => ['nurse', 'care_coordinator'].includes(item.role)), [staff])
  const doctors = useMemo(() => staff.filter((item) => item.role === 'doctor'), [staff])

  async function addPatient() {
    if (!patientId.trim()) {
      toast.error('Informe o UUID do usuário do piloto.')
      return
    }
    setSaving(true)
    try {
      const metadata = {
        patient_name: patientName.trim() || null,
        patient_email: patientEmail.trim() || null,
        enrolled_by: staffSelf?.user_id,
      }
      const { error } = await supabase.from('concierge_memberships').upsert({
        patient_id: patientId.trim(),
        status: 'pilot',
        plan_code: 'concierge_pilot',
        has_health_plan: hasHealthPlan === 'unknown' ? null : hasHealthPlan === 'yes',
        pilot_cohort: 'mvp_100',
        metadata,
      }, { onConflict: 'patient_id' })
      if (error) throw error

      setPatientId('')
      setPatientName('')
      setPatientEmail('')
      setHasHealthPlan('unknown')
      toast.success('Paciente incluído no piloto. Acesso aos dados permanece pendente até o consentimento do paciente.')
      await load()
    } catch (error) {
      console.error('Pilot enrollment failed:', error)
      toast.error('Não foi possível incluir o paciente. Confirme se as migrations do piloto estão ativas.')
    } finally {
      setSaving(false)
    }
  }

  async function assign(patient: any, professionalId: string, requestedRole: 'nurse' | 'doctor') {
    if (!professionalId) return
    const professional = staff.find((item) => item.user_id === professionalId)
    const effectiveRole = requestedRole === 'doctor'
      ? 'doctor'
      : professional?.role === 'care_coordinator' ? 'care_coordinator' : 'nurse'

    try {
      const { error } = await supabase.rpc('concierge_set_primary_assignment', {
        target_patient: patient.patient_id,
        target_professional: professionalId,
        target_role: effectiveRole,
      })
      if (error) throw error
      toast.success(`${requestedRole === 'nurse' ? 'Enfermagem/coordenação' : 'Médico'} de referência atualizado`)
      await load()
    } catch (error) {
      console.error('Team assignment failed:', error)
      toast.error('Não foi possível atualizar a equipe.')
    }
  }

  function currentAssignment(patientIdValue: string, role: string) {
    return assignments.find((item) => item.patient_id === patientIdValue && item.role === role)
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>

  if (!staffSelf?.active || !['admin', 'care_coordinator'].includes(staffSelf.role)) {
    return <div className="rounded-2xl border bg-white p-6 text-center text-sm text-muted-foreground">Carteira restrita à coordenação do Health Concierge.</div>
  }

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-teal-950 to-emerald-800 p-5 text-white">
        <button type="button" onClick={() => navigate('/concierge/ops')} className="mb-4 flex items-center gap-2 text-sm text-white/70"><ArrowLeft className="h-4 w-4" /> Operação</button>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/60"><Users className="h-4 w-4" /> Carteira Concierge</div>
        <h1 className="mt-2 text-2xl font-bold">Pacientes e equipe de referência</h1>
        <p className="mt-2 text-sm text-white/75">Monte o piloto, diferencie quem já possui plano de saúde e distribua carteiras entre enfermagem e médicos.</p>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-emerald-700" /><h2 className="font-bold">Adicionar paciente ao piloto</h2></div>
        <p className="mt-1 text-xs text-muted-foreground">Neste MVP interno usamos o UUID do usuário. A inclusão cria apenas o vínculo operacional; o paciente ainda precisa autorizar explicitamente o Concierge.</p>
        <div className="mt-4 grid gap-2">
          <input value={patientId} onChange={(event) => setPatientId(event.target.value)} placeholder="UUID do usuário" className="rounded-xl border px-3 py-3 text-sm" />
          <input value={patientName} onChange={(event) => setPatientName(event.target.value)} placeholder="Nome para operação" className="rounded-xl border px-3 py-3 text-sm" />
          <input value={patientEmail} onChange={(event) => setPatientEmail(event.target.value)} placeholder="E-mail" className="rounded-xl border px-3 py-3 text-sm" />
          <select value={hasHealthPlan} onChange={(event) => setHasHealthPlan(event.target.value)} className="rounded-xl border bg-white px-3 py-3 text-sm"><option value="unknown">Possui plano? Não informado</option><option value="yes">Possui plano</option><option value="no">Não possui plano</option></select>
        </div>
        <button disabled={saving} onClick={addPatient} className="mt-3 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Adicionar ao piloto'}</button>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Carteira</h2><span className="text-xs text-muted-foreground">{memberships.length} pacientes</span></div>
        <div className="space-y-3">
          {memberships.map((member) => {
            const nurse = currentAssignment(member.patient_id, 'nurse') || currentAssignment(member.patient_id, 'care_coordinator')
            const doctor = currentAssignment(member.patient_id, 'doctor')
            return (
              <div key={member.id} className="rounded-2xl border bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center"><ShieldCheck className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1"><p className="font-bold truncate">{member.metadata?.patient_name || member.metadata?.patient_email || member.patient_id}</p><p className="mt-1 text-xs text-muted-foreground">{member.has_health_plan === true ? 'Com plano de saúde' : member.has_health_plan === false ? 'Sem plano de saúde' : 'Plano não informado'} · {member.status} · consentimento {member.consent_status || 'pendente'}</p></div>
                </div>

                <div className="mt-4 grid gap-2">
                  <label className="text-xs font-semibold text-slate-600">Enfermeira / coordenação
                    <select value={nurse?.professional_id || ''} onChange={(event) => assign(member, event.target.value, 'nurse')} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm"><option value="">Sem atribuição</option>{nurses.map((item) => <option key={item.user_id} value={item.user_id}>{item.display_name || item.user_id} · {item.role}</option>)}</select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Médico de referência
                    <select value={doctor?.professional_id || ''} onChange={(event) => assign(member, event.target.value, 'doctor')} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm"><option value="">Sem atribuição</option>{doctors.map((item) => <option key={item.user_id} value={item.user_id}>{item.display_name || item.user_id}{item.specialty ? ` · ${item.specialty}` : ''}</option>)}</select>
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/concierge/ops" className="rounded-2xl border bg-white p-4 text-center text-sm font-bold">Fila de casos</Link>
        <Link to="/concierge/ops/pilot" className="rounded-2xl bg-slate-900 p-4 text-center text-sm font-bold text-white">Métricas do piloto</Link>
      </div>
    </div>
  )
}
