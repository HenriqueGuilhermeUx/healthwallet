import { useState, useEffect } from 'react'
import {
  Users,
  Plus,
  Heart,
  Trash2,
  User,
  Droplets,
  Calendar,
  Pill,
  AlertTriangle,
  FileText,
  CreditCard,
  X,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

interface FamilyMember {
  id: string
  name: string
  relationship: string
  birth_date?: string
  blood_type?: string
  allergies?: string
  medications?: string
  conditions?: string
  health_plan?: string
  notes?: string
}

export default function Family() {
  const { user } = useAuth()
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    relationship: '',
    birth_date: '',
    blood_type: '',
    allergies: '',
    medications: '',
    conditions: '',
    health_plan: '',
    notes: '',
  })

  useEffect(() => {
    loadMembers()
  }, [user])

  async function loadMembers() {
    if (!user) return

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
      await supabase.from('family_members').insert({
        user_id: user.id,
        ...formData,
      })

      setShowAddForm(false)
      setFormData({
        name: '',
        relationship: '',
        birth_date: '',
        blood_type: '',
        allergies: '',
        medications: '',
        conditions: '',
        health_plan: '',
        notes: '',
      })

      loadMembers()
    } catch (error) {
      console.error('Error adding member:', error)
      alert('Erro ao adicionar familiar')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja remover este membro?')) return

    await supabase.from('family_members').delete().eq('id', id)
    setSelectedMember(null)
    loadMembers()
  }

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 text-white p-5">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Minha Família</h1>
            <p className="text-white/80 text-sm">
              Gerencie dados básicos, saúde e cuidados dos familiares.
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={() => setShowAddForm(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold"
      >
        <Plus className="w-5 h-5" />
        Adicionar familiar
      </button>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Carregando...
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-dashed">
          <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Nenhum familiar</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Adicione familiares para organizar saúde, exames, alergias e medicamentos.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm"
          >
            Adicionar familiar
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <div key={member.id} className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center">
                  <Heart className="w-6 h-6 text-pink-600" />
                </div>

                <div className="flex-1">
                  <p className="font-semibold">{member.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {member.relationship || 'Parentesco não informado'}
                  </p>

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <MiniInfo label="Sangue" value={member.blood_type || '—'} />
                    <MiniInfo label="Idade" value={member.birth_date ? `${calculateAge(member.birth_date)} anos` : '—'} />
                  </div>

                  <button
                    onClick={() => setSelectedMember(member)}
                    className="mt-3 w-full py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium"
                  >
                    Ver perfil
                  </button>
                </div>

                <button onClick={() => handleDelete(member.id)} className="text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-bold">Adicionar familiar</h2>
              <button onClick={() => setShowAddForm(false)} className="text-muted-foreground">
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              <Input label="Nome *" value={formData.name} onChange={(v: string) => setFormData({ ...formData, name: v })} />

              <div>
                <label className="text-sm font-medium mb-1 block">Parentesco</label>
                <select
                  value={formData.relationship}
                  onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                >
                  <option value="">Selecione</option>
                  <option value="Cônjuge">Cônjuge</option>
                  <option value="Filho(a)">Filho(a)</option>
                  <option value="Pai/Mãe">Pai/Mãe</option>
                  <option value="Irmão(ã)">Irmão(ã)</option>
                  <option value="Avô/Avó">Avô/Avó</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Data de nascimento</label>
                <input
                  type="date"
                  value={formData.birth_date}
                  onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Tipo sanguíneo</label>
                <select
                  value={formData.blood_type}
                  onChange={(e) => setFormData({ ...formData, blood_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                >
                  <option value="">Selecione</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>

              <Input label="Alergias" placeholder="Ex: dipirona, amendoim..." value={formData.allergies} onChange={(v: string) => setFormData({ ...formData, allergies: v })} />
              <Input label="Medicamentos" placeholder="Ex: losartana 50mg..." value={formData.medications} onChange={(v: string) => setFormData({ ...formData, medications: v })} />
              <Input label="Condições de saúde" placeholder="Ex: diabetes, hipertensão..." value={formData.conditions} onChange={(v: string) => setFormData({ ...formData, conditions: v })} />
              <Input label="Plano/SUS" placeholder="Ex: Unimed, Bradesco, SUS..." value={formData.health_plan} onChange={(v: string) => setFormData({ ...formData, health_plan: v })} />

              <div>
                <label className="text-sm font-medium mb-1 block">Observações</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background min-h-[90px]"
                  placeholder="Cuidados, histórico, rotina, médicos..."
                />
              </div>

              <button
                onClick={handleAddMember}
                className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold"
              >
                Salvar familiar
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
                <p className="text-sm text-muted-foreground">
                  {selectedMember.relationship || 'Familiar'}
                </p>
              </div>

              <button onClick={() => setSelectedMember(null)} className="text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              <ProfileCard icon={User} title="Dados básicos">
                <Info label="Nome" value={selectedMember.name} />
                <Info label="Parentesco" value={selectedMember.relationship} />
                <Info label="Nascimento" value={selectedMember.birth_date ? formatDate(selectedMember.birth_date) : ''} />
                <Info label="Idade" value={selectedMember.birth_date ? `${calculateAge(selectedMember.birth_date)} anos` : ''} />
                <Info label="Tipo sanguíneo" value={selectedMember.blood_type} />
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

              <ProfileCard icon={FileText} title="Resumo familiar">
                <Info label="Observações" value={selectedMember.notes} />
              </ProfileCard>

              <button
                onClick={() => handleDelete(selectedMember.id)}
                className="w-full py-3 rounded-xl border border-red-200 text-red-600 font-medium"
              >
                Remover familiar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
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
    <div className="bg-white rounded-xl border p-4">
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
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background"
      />
    </div>
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
