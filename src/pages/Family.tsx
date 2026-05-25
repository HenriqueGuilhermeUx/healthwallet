import { useState, useEffect } from 'react'
import { Users, Plus, Heart, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

interface FamilyMember {
  id: string
  name: string
  relationship: string
  birth_date?: string
  blood_type?: string
}

export default function Family() {
  const { user } = useAuth()
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    relationship: '',
    birth_date: '',
    blood_type: '',
  })

  useEffect(() => {
    loadMembers()
  }, [user])

  const loadMembers = async () => {
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

  const handleAddMember = async () => {
    if (!user || !formData.name) return

    try {
      await supabase.from('family_members').insert({
        user_id: user.id,
        ...formData,
      })
      setShowAddForm(false)
      setFormData({ name: '', relationship: '', birth_date: '', blood_type: '' })
      loadMembers()
    } catch (error) {
      console.error('Error adding member:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja remover este membro?')) return
    await supabase.from('family_members').delete().eq('id', id)
    loadMembers()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Família</h1>
          <p className="text-sm text-muted-foreground">Gerencie saúde da família</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white hover:bg-emerald-700"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : members.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-dashed">
          <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Nenhum membro</h3>
          <p className="text-sm text-muted-foreground mb-4">Adicione membros da família para gerenciar a saúde de todos</p>
          <button onClick={() => setShowAddForm(true)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">
            Adicionar Membro
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
                  <p className="text-sm text-muted-foreground">{member.relationship}</p>
                  {member.blood_type && (
                    <p className="text-xs text-muted-foreground mt-1">Tipo sanguíneo: {member.blood_type}</p>
                  )}
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
              <h2 className="font-bold">Adicionar Membro</h2>
              <button onClick={() => setShowAddForm(false)} className="text-muted-foreground">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Nome *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </div>
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
                  <option value="Outro">Outro</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Tipo Sanguíneo</label>
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
              <button
                onClick={handleAddMember}
                className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}