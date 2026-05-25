import { useState, useEffect } from 'react'
import { User, Mail, Phone, Calendar, Heart, Shield, ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

export default function Profile() {
  const { user, signOut } = useAuth()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState({
    birth_date: '',
    gender: '',
    blood_type: '',
    phone: '',
    allergies: [] as string[],
  })

  useEffect(() => {
    loadProfile()
  }, [user])

  const loadProfile = async () => {
    if (!user) return
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (data) {
        setProfile(data)
        setFormData({
          birth_date: data.birth_date || '',
          gender: data.gender || '',
          blood_type: data.blood_type || '',
          phone: data.phone || '',
          allergies: data.allergies || [],
        })
      } else {
        // Create profile if doesn't exist
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert({ user_id: user.id })
          .select()
          .single()
        setProfile(newProfile)
      }
    } catch (error) {
      console.error('Error loading profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!user) return
    try {
      await supabase
        .from('profiles')
        .update(formData)
        .eq('user_id', user.id)
      setEditing(false)
      loadProfile()
    } catch (error) {
      console.error('Error saving profile:', error)
    }
  }

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/'
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Carregando...</div>
  }

  return (
    <div className="space-y-5">
      {/* Avatar */}
      <div className="flex flex-col items-center">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-4">
          <User className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-xl font-bold">{user?.user_metadata?.full_name || user?.user_metadata?.name || 'Usuário'}</h1>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
      </div>

      {/* Profile Info */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <p className="font-semibold">Informações Pessoais</p>
          <button onClick={() => setEditing(!editing)} className="text-sm text-emerald-600">
            {editing ? 'Cancelar' : 'Editar'}
          </button>
        </div>

        {editing ? (
          <div className="p-4 space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Data de Nascimento</label>
              <input
                type="date"
                value={formData.birth_date}
                onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Gênero</label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
              >
                <option value="">Selecione</option>
                <option value="male">Masculino</option>
                <option value="female">Feminino</option>
                <option value="other">Outro</option>
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
            <div>
              <label className="text-sm font-medium mb-1 block">Telefone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(11) 99999-9999"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
              />
            </div>
            <button onClick={handleSave} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold">
              Salvar Alterações
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Data de Nascimento</p>
                <p className="text-sm">{profile?.birth_date || 'Não informado'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Heart className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Tipo Sanguíneo</p>
                <p className="text-sm">{profile?.blood_type || 'Não informado'}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Emergency Profile */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <a href="#" className="flex items-center gap-3 p-4 hover:bg-muted/50">
          <Shield className="w-5 h-5 text-red-500" />
          <div className="flex-1">
            <p className="font-semibold text-sm">Perfil de Emergência</p>
            <p className="text-xs text-muted-foreground">Alergias e informações para emergências</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </a>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full py-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
      >
        Sair da conta
      </button>
    </div>
  )
}