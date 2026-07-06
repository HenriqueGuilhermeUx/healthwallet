import { useState, useEffect } from 'react'
import {
  Users,
  Plus,
  Heart,
  Trash2,
  User,
  Droplets,
  Pill,
  AlertTriangle,
  FileText,
  CreditCard,
  X,
  ShieldCheck,
  Bell,
  Phone,
  Mail,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

interface FamilyMember {
  id: string
  name: string
  relationship: string
  member_type?: 'patient' | 'caregiver' | 'relative' | 'professional'
  birth_date?: string
  blood_type?: string
  phone?: string
  email?: string
  allergies?: string
  medications?: string
  conditions?: string
  health_plan?: string
  notes?: string
  care_notes?: string
  is_elderly?: boolean
  is_caregiver?: boolean
  master_access?: boolean
  emergency_contact?: boolean
  notify_medications?: boolean
  notify_appointments?: boolean
  notify_exams?: boolean
  notify_sos?: boolean
  preferred_contact_method?: string
}

const emptyForm = {
  name: '',
  relationship: '',
  member_type: 'patient',
  birth_date: '',
  blood_type: '',
  phone: '',
  email: '',
  allergies: '',
  medications: '',
  conditions: '',
  health_plan: '',
  notes: '',
  care_notes: '',
  is_elderly: false,
  is_caregiver: false,
  master_access: false,
  emergency_contact: false,
  notify_medications: true,
  notify_appointments: true,
  notify_exams: true,
  notify_sos: true,
  preferred_contact_method: 'whatsapp',
}

export default function Family() {
  const { user } = useAuth()
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null)
  const [formData, setFormData] = useState<any>(emptyForm)

  useEffect(() => {
    loadMembers()
  }, [user])

  async function loadMembers() {
    if (!user) return

    setLoading(true)

    try {
      const { data } = await supabase
        .from('family_members')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setMembers(data || [])
    } catch (error) {
      console.error('Error loading family:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddMember() {
    if (!user || !formData.name) {
      alert('Informe o nome do familiar')
      return
    }

    try {
      const payload = {
        user_id: user.id,
        name: formData.name,
        relationship: formData.relationship,
        member_type: formData.member_type,
        birth_date: formData.birth_date || null,
        blood_type: formData.blood_type,
        phone: formData.phone,
        email: formData.email,
        allergies: formData.allergies,
        medications: formData.medications,
        conditions: formData.conditions,
        health_plan: formData.health_plan,
        notes: formData.notes,
        care_notes: formData.care_notes,
        is_elderly: formData.is_elderly,
        is_caregiver: formData.is_caregiver,
        master_access: formData.master_access,
        emergency_contact: formData.emergency_contact,
        notify_medications: formData.notify_medications,
        notify_appointments: formData.notify_appointments,
        notify_exams: formData.notify_exams,
        notify_sos: formData.notify_sos,
        preferred_contact_method: formData.preferred_contact_method,
      }

      const { data, error } = await supabase
        .from('family_members')
        .insert(payload)
        .select()
        .single()

      if (error) throw error

      if (formData.master_access || formData.is_caregiver) {
        await supabase.from('care_circle_members').insert({
          owner_user_id: user.id,
          family_member_id: data.id,
          member_name: formData.name,
          member_email: formData.email || null,
          member_phone: formData.phone || null,
          relationship: formData.relationship,
          role: formData.master_access ? 'master_family' : 'caregiver',
          access_level: formData.master_access ? 'master' : 'care',
          status: 'active',
          can_view_passport: true,
          can_view_exams: formData.master_access,
          can_view_medications: true,
          can_view_timeline: true,
          can_view_medscore: formData.master_access,
          can_receive_sos: formData.notify_sos,
          can_receive_medication_alerts: formData.notify_medications,
          can_receive_appointment_alerts: formData.notify_appointments,
        })
      }

      if (formData.emergency_contact && (formData.phone || formData.email)) {
        await supabase.from('emergency_contacts').insert({
          user_id: user.id,
          family_member_id: data.id,
          name: formData.name,
          relationship: formData.relationship,
          phone: formData.phone || null,
          email: formData.email || null,
          is_primary: members.length === 0,
          can_receive_sos: formData.notify_sos,
          can_receive_medication_alerts: formData.notify_medications,
        })
      }

      setShowAddForm(false)
      setFormData(emptyForm)
      loadMembers()
    } catch (error: any) {
      console.error('Error adding member:', error)
      alert(error.message || 'Erro ao adicionar familiar. Rode o SQL_FAMILIA_IDOSOS_FASE1.sql no Supabase se ainda não rodou.')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja remover este membro?')) return

    await supabase.from('family_members').delete().eq('id', id)
    setSelectedMember(null)
    loadMembers()
  }

  const monitored = members.filter((m) => m.member_type === 'patient' || m.is_elderly)
  const caregivers = members.filter((m) => m.master_access || m.is_caregiver || m.member_type === 'caregiver' || m.member_type === 'relative')

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-700 to-purple-800 text-white p-5">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Círculo de Cuidado</h1>
            <p className="text-white/80 text-sm">
              Família, idosos, cuidadores, acesso master e alertas importantes.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Pessoas" value={members.length} />
        <StatCard label="Cuidados" value={monitored.length} />
        <StatCard label="Masters" value={members.filter((m) => m.master_access).length} />
      </div>

      <section className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <div className="flex gap-3">
          <ShieldCheck className="w-6 h-6 text-emerald-700 mt-0.5" />
          <div>
            <h2 className="font-bold text-emerald-950">Acesso master familiar</h2>
            <p className="text-sm text-emerald-800 mt-1">
              Um familiar master pode acompanhar medicamentos, exames, agenda, Passport, MedScore e alertas sem gerar código temporário. O código continua sendo usado para profissionais externos.
            </p>
          </div>
        </div>
      </section>

      <button
        onClick={() => setShowAddForm(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold"
      >
        <Plus className="w-5 h-5" />
        Adicionar pessoa
      </button>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : members.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-dashed">
          <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Nenhuma pessoa cadastrada</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Cadastre idosos, filhos, cuidadores e familiares que recebem alertas.
          </p>
          <button onClick={() => setShowAddForm(true)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">
            Adicionar
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {caregivers.length > 0 && (
            <MemberGroup title="Familiares e cuidadores" members={caregivers} onSelect={setSelectedMember} onDelete={handleDelete} />
          )}
          {monitored.length > 0 && (
            <MemberGroup title="Pessoas cuidadas" members={monitored} onSelect={setSelectedMember} onDelete={handleDelete} />
          )}
          {members.filter((m) => !caregivers.includes(m) && !monitored.includes(m)).length > 0 && (
            <MemberGroup
              title="Outros"
              members={members.filter((m) => !caregivers.includes(m) && !monitored.includes(m))}
              onSelect={setSelectedMember}
              onDelete={handleDelete}
            />
          )}
        </div>
      )}

      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-bold">Adicionar ao cuidado</h2>
              <button onClick={() => setShowAddForm(false)} className="text-muted-foreground">✕</button>
            </div>

            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              <Input label="Nome *" value={formData.name} onChange={(v: string) => setFormData({ ...formData, name: v })} />

              <div>
                <label className="text-sm font-medium mb-1 block">Tipo</label>
                <select value={formData.member_type} onChange={(e) => setFormData({ ...formData, member_type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-border bg-background">
                  <option value="patient">Pessoa cuidada</option>
                  <option value="relative">Familiar</option>
                  <option value="caregiver">Cuidador</option>
                  <option value="professional">Profissional</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Parentesco / vínculo</label>
                <select value={formData.relationship} onChange={(e) => setFormData({ ...formData, relationship: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-border bg-background">
                  <option value="">Selecione</option>
                  <option value="Cônjuge">Cônjuge</option>
                  <option value="Filho(a)">Filho(a)</option>
                  <option value="Pai/Mãe">Pai/Mãe</option>
                  <option value="Irmão(ã)">Irmão(ã)</option>
                  <option value="Avô/Avó">Avô/Avó</option>
                  <option value="Cuidador(a)">Cuidador(a)</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Nascimento</label>
                  <input type="date" value={formData.birth_date} onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-border bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Sangue</label>
                  <select value={formData.blood_type} onChange={(e) => setFormData({ ...formData, blood_type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-border bg-background">
                    <option value="">—</option>
                    <option value="A+">A+</option><option value="A-">A-</option>
                    <option value="B+">B+</option><option value="B-">B-</option>
                    <option value="AB+">AB+</option><option value="AB-">AB-</option>
                    <option value="O+">O+</option><option value="O-">O-</option>
                  </select>
                </div>
              </div>

              <Input label="Telefone" value={formData.phone} onChange={(v: string) => setFormData({ ...formData, phone: v })} placeholder="WhatsApp ou telefone" />
              <Input label="E-mail" value={formData.email} onChange={(v: string) => setFormData({ ...formData, email: v })} placeholder="para convite futuro" />
              <Input label="Alergias" value={formData.allergies} onChange={(v: string) => setFormData({ ...formData, allergies: v })} />
              <Input label="Medicamentos" value={formData.medications} onChange={(v: string) => setFormData({ ...formData, medications: v })} />
              <Input label="Condições" value={formData.conditions} onChange={(v: string) => setFormData({ ...formData, conditions: v })} />
              <Input label="Plano/SUS" value={formData.health_plan} onChange={(v: string) => setFormData({ ...formData, health_plan: v })} />

              <div className="grid grid-cols-2 gap-2">
                <Check label="Idoso" checked={formData.is_elderly} onChange={(v: boolean) => setFormData({ ...formData, is_elderly: v })} />
                <Check label="Cuidador" checked={formData.is_caregiver} onChange={(v: boolean) => setFormData({ ...formData, is_caregiver: v })} />
                <Check label="Acesso master" checked={formData.master_access} onChange={(v: boolean) => setFormData({ ...formData, master_access: v })} />
                <Check label="Contato emergência" checked={formData.emergency_contact} onChange={(v: boolean) => setFormData({ ...formData, emergency_contact: v })} />
              </div>

              <div className="bg-muted/40 rounded-xl p-3 space-y-2">
                <p className="text-sm font-semibold">Receber alertas</p>
                <div className="grid grid-cols-2 gap-2">
                  <Check label="Medicamentos" checked={formData.notify_medications} onChange={(v: boolean) => setFormData({ ...formData, notify_medications: v })} />
                  <Check label="Consultas" checked={formData.notify_appointments} onChange={(v: boolean) => setFormData({ ...formData, notify_appointments: v })} />
                  <Check label="Exames" checked={formData.notify_exams} onChange={(v: boolean) => setFormData({ ...formData, notify_exams: v })} />
                  <Check label="Ajuda rápida" checked={formData.notify_sos} onChange={(v: boolean) => setFormData({ ...formData, notify_sos: v })} />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Observações</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-border bg-background min-h-[90px]" placeholder="Rotina, médicos, cuidados, preferências..." />
              </div>

              <button onClick={handleAddMember} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold">
                Salvar pessoa
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h2 className="font-bold">{selectedMember.name}</h2>
                <p className="text-sm text-muted-foreground">{selectedMember.relationship || 'Familiar'}</p>
              </div>
              <button onClick={() => setSelectedMember(null)} className="text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {selectedMember.master_access && <Badge text="Master" />}
                {selectedMember.is_elderly && <Badge text="Idoso" />}
                {selectedMember.is_caregiver && <Badge text="Cuidador" />}
                {selectedMember.emergency_contact && <Badge text="Emergência" />}
              </div>

              <ProfileCard icon={User} title="Dados básicos">
                <Info label="Nome" value={selectedMember.name} />
                <Info label="Vínculo" value={selectedMember.relationship} />
                <Info label="Nascimento" value={selectedMember.birth_date ? formatDate(selectedMember.birth_date) : ''} />
                <Info label="Idade" value={selectedMember.birth_date ? `${calculateAge(selectedMember.birth_date)} anos` : ''} />
                <Info label="Tipo sanguíneo" value={selectedMember.blood_type} />
              </ProfileCard>

              <ProfileCard icon={Phone} title="Contato">
                <Info label="Telefone" value={selectedMember.phone} />
                <Info label="E-mail" value={selectedMember.email} />
              </ProfileCard>

              <ProfileCard icon={AlertTriangle} title="Alergias">
                <Info label="Alergias" value={selectedMember.allergies} />
              </ProfileCard>

              <ProfileCard icon={Pill} title="Medicamentos">
                <Info label="Medicamentos" value={selectedMember.medications} />
              </ProfileCard>

              <ProfileCard icon={Heart} title="Condições">
                <Info label="Condições" value={selectedMember.conditions} />
              </ProfileCard>

              <ProfileCard icon={CreditCard} title="Plano/SUS">
                <Info label="Carteira" value={selectedMember.health_plan} />
              </ProfileCard>

              <ProfileCard icon={Bell} title="Alertas">
                <Info label="Medicamentos" value={selectedMember.notify_medications ? 'Sim' : 'Não'} />
                <Info label="Consultas" value={selectedMember.notify_appointments ? 'Sim' : 'Não'} />
                <Info label="Exames" value={selectedMember.notify_exams ? 'Sim' : 'Não'} />
                <Info label="Ajuda rápida" value={selectedMember.notify_sos ? 'Sim' : 'Não'} />
              </ProfileCard>

              <ProfileCard icon={FileText} title="Resumo familiar">
                <Info label="Observações" value={selectedMember.notes} />
              </ProfileCard>

              <button onClick={() => handleDelete(selectedMember.id)} className="w-full py-3 rounded-xl border border-red-200 text-red-600 font-medium">
                Remover pessoa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MemberGroup({ title, members, onSelect, onDelete }: any) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      {members.map((member: FamilyMember) => (
        <div key={member.id} className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center">
              <Heart className="w-6 h-6 text-pink-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold">{member.name}</p>
                {member.master_access && <Badge text="Master" />}
                {member.is_elderly && <Badge text="Idoso" />}
              </div>
              <p className="text-sm text-muted-foreground">{member.relationship || 'Vínculo não informado'}</p>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <MiniInfo label="Sangue" value={member.blood_type || '—'} />
                <MiniInfo label="Idade" value={member.birth_date ? `${calculateAge(member.birth_date)} anos` : '—'} />
              </div>
              <button onClick={() => onSelect(member)} className="mt-3 w-full py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium">
                Ver cuidado
              </button>
            </div>
            <button onClick={() => onDelete(member.id)} className="text-red-500">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}

function StatCard({ label, value }: any) {
  return (
    <div className="bg-white rounded-xl border p-3 text-center">
      <p className="text-2xl font-bold text-indigo-700">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function Badge({ text }: any) {
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">{text}</span>
}

function MiniInfo({ label, value }: any) {
  return (
    <div className="bg-muted/40 rounded-lg p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}

function ProfileCard({ icon: Icon, title, children }: any) {
  return (
    <div className="bg-muted/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5 text-indigo-600" />
        <h3 className="font-bold">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Info({ label, value }: any) {
  return (
    <p className="text-sm py-1">
      <strong>{label}:</strong> {value || 'Não informado'}
    </p>
  )
}

function Input({ label, value, onChange, placeholder = '' }: any) {
  return (
    <div>
      <label className="text-sm font-medium mb-1 block">{label}</label>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background" />
    </div>
  )
}

function Check({ label, checked, onChange }: any) {
  return (
    <label className="flex items-center gap-2 text-sm bg-white rounded-lg border p-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function calculateAge(date: string) {
  const birth = new Date(date)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()

  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--
  }

  return age
}

function formatDate(date: string) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('pt-BR')
}
