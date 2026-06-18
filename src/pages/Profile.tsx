import { useState, useEffect } from 'react'
import { User, Phone, Calendar, Heart, Shield, ChevronRight, Activity } from 'lucide-react'
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
    weight: '',
    height: '',
    smoking_status: '',
    alcohol_consumption: '',
    physical_activity: '',
    sleep_hours: '',
    stress_level: '',
    chronic_conditions: '',
    family_history: '',
    current_medications: '',
    allergies_text: '',
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
        .eq('id', user.id)
        .maybeSingle()

      if (data) {
        setProfile(data)
        setFormData({
          birth_date: data.birth_date || '',
          gender: data.gender || '',
          blood_type: data.blood_type || '',
          phone: data.phone || '',
          weight: data.weight ? String(data.weight) : '',
          height: data.height ? String(data.height) : '',
          smoking_status: data.smoking_status || '',
          alcohol_consumption: data.alcohol_consumption || '',
          physical_activity: data.physical_activity || '',
          sleep_hours: data.sleep_hours ? String(data.sleep_hours) : '',
          stress_level: data.stress_level || '',
          chronic_conditions: data.chronic_conditions || '',
          family_history: data.family_history || '',
          current_medications: data.current_medications || '',
          allergies_text: Array.isArray(data.allergies) ? data.allergies.join(', ') : '',
        })
      } else {
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert({ id: user.id })
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

  const calculateScore = () => {
    let score = 50

    if (formData.weight && formData.height) {
      const h = Number(formData.height) / 100
      const bmi = Number(formData.weight) / (h * h)
      if (bmi >= 18.5 && bmi < 25) score += 10
      if (bmi >= 25 && bmi < 30) score += 3
    }

    if (formData.physical_activity === 'moderate' || formData.physical_activity === 'active') score += 10
    if (formData.sleep_hours && Number(formData.sleep_hours) >= 6 && Number(formData.sleep_hours) <= 9) score += 10
    if (formData.smoking_status === 'never') score += 10
    if (formData.blood_type) score += 5

    return Math.max(0, Math.min(100, score))
  }

  const handleSave = async () => {
    if (!user) return

    try {
      const score = calculateScore()

      const payload = {
        birth_date: formData.birth_date || null,
        gender: formData.gender || null,
        blood_type: formData.blood_type || null,
        phone: formData.phone || null,
        weight: formData.weight ? Number(formData.weight) : null,
        height: formData.height ? Number(formData.height) : null,
        smoking_status: formData.smoking_status || null,
        alcohol_consumption: formData.alcohol_consumption || null,
        physical_activity: formData.physical_activity || null,
        sleep_hours: formData.sleep_hours ? Number(formData.sleep_hours) : null,
        stress_level: formData.stress_level || null,
        chronic_conditions: formData.chronic_conditions || null,
        family_history: formData.family_history || null,
        current_medications: formData.current_medications || null,
        allergies: formData.allergies_text
          ? formData.allergies_text.split(',').map((item) => item.trim()).filter(Boolean)
          : [],
        med_score: score,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', user.id)

      if (error) throw error

      await supabase.from('health_scores').insert({
        user_id: user.id,
        score,
        status: score >= 75 ? 'Bom' : score >= 60 ? 'Atenção' : 'Regular',
        factors: {
          source: 'profile',
          physicalActivity: formData.physical_activity,
          sleepHours: formData.sleep_hours,
          smokingStatus: formData.smoking_status,
        },
        calculated_at: new Date().toISOString(),
      })

      localStorage.setItem(
        `healthwallet_profile_${user.id}`,
        JSON.stringify({
          birthDate: payload.birth_date,
          gender: payload.gender,
          bloodType: payload.blood_type,
          phone: payload.phone,
          weight: payload.weight,
          height: payload.height,
          smokingStatus: payload.smoking_status,
          alcoholConsumption: payload.alcohol_consumption,
          physicalActivity: payload.physical_activity,
          sleepHours: payload.sleep_hours,
          stressLevel: payload.stress_level,
          allergies: payload.allergies,
          chronicConditions: payload.chronic_conditions,
          familyHistory: payload.family_history,
          currentMedications: payload.current_medications,
          medScore: score,
          fullName:
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split('@')[0] ||
            'Usuário',
        })
      )

      setEditing(false)
      loadProfile()
    } catch (error) {
      console.error('Error saving profile:', error)
      alert('Erro ao salvar perfil')
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
      <div className="flex flex-col items-center">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-4">
          <User className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-xl font-bold">
          {user?.user_metadata?.full_name || user?.user_metadata?.name || 'Usuário'}
        </h1>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <p className="font-semibold">Perfil de Saúde</p>
          <button onClick={() => setEditing(!editing)} className="text-sm text-emerald-600">
            {editing ? 'Cancelar' : 'Editar'}
          </button>
        </div>

        {editing ? (
          <div className="p-4 space-y-4">
            <Input label="Data de Nascimento" type="date" value={formData.birth_date} onChange={(v) => setFormData({ ...formData, birth_date: v })} />
            <Input label="Peso (kg)" type="number" value={formData.weight} onChange={(v) => setFormData({ ...formData, weight: v })} />
            <Input label="Altura (cm)" type="number" value={formData.height} onChange={(v) => setFormData({ ...formData, height: v })} />
            <Input label="Telefone" type="tel" value={formData.phone} onChange={(v) => setFormData({ ...formData, phone: v })} />

            <Select label="Gênero" value={formData.gender} onChange={(v) => setFormData({ ...formData, gender: v })} options={[
              ['', 'Selecione'],
              ['male', 'Masculino'],
              ['female', 'Feminino'],
              ['other', 'Outro'],
            ]} />

            <Select label="Tipo Sanguíneo" value={formData.blood_type} onChange={(v) => setFormData({ ...formData, blood_type: v })} options={[
              ['', 'Selecione'],
              ['A+', 'A+'], ['A-', 'A-'], ['B+', 'B+'], ['B-', 'B-'],
              ['AB+', 'AB+'], ['AB-', 'AB-'], ['O+', 'O+'], ['O-', 'O-'],
            ]} />

            <Select label="Atividade Física" value={formData.physical_activity} onChange={(v) => setFormData({ ...formData, physical_activity: v })} options={[
              ['', 'Selecione'],
              ['sedentary', 'Sedentário'],
              ['light', 'Leve'],
              ['moderate', 'Moderado'],
              ['active', 'Ativo'],
            ]} />

            <Select label="Tabagismo" value={formData.smoking_status} onChange={(v) => setFormData({ ...formData, smoking_status: v })} options={[
              ['', 'Selecione'],
              ['never', 'Nunca fumei'],
              ['former', 'Ex-fumante'],
              ['current', 'Fumante atual'],
            ]} />

            <Select label="Álcool" value={formData.alcohol_consumption} onChange={(v) => setFormData({ ...formData, alcohol_consumption: v })} options={[
              ['', 'Selecione'],
              ['never', 'Nunca'],
              ['occasional', 'Ocasional'],
              ['moderate', 'Moderado'],
              ['frequent', 'Frequente'],
            ]} />

            <Input label="Horas de sono" type="number" value={formData.sleep_hours} onChange={(v) => setFormData({ ...formData, sleep_hours: v })} />

            <Textarea label="Alergias" value={formData.allergies_text} onChange={(v) => setFormData({ ...formData, allergies_text: v })} placeholder="Ex: penicilina, camarão" />
            <Textarea label="Condições / doenças" value={formData.chronic_conditions} onChange={(v) => setFormData({ ...formData, chronic_conditions: v })} placeholder="Ex: hipertensão, diabetes" />
            <Textarea label="Medicamentos atuais" value={formData.current_medications} onChange={(v) => setFormData({ ...formData, current_medications: v })} placeholder="Ex: Losartana 50mg" />
            <Textarea label="Histórico familiar" value={formData.family_history} onChange={(v) => setFormData({ ...formData, family_history: v })} placeholder="Ex: diabetes na mãe, hipertensão no pai" />

            <button onClick={handleSave} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold">
              Salvar Perfil
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <Info icon={Calendar} label="Nascimento" value={profile?.birth_date} />
            <Info icon={Heart} label="Tipo Sanguíneo" value={profile?.blood_type} />
            <Info icon={Activity} label="Peso / Altura" value={`${profile?.weight || '—'} kg / ${profile?.height || '—'} cm`} />
            <Info icon={Phone} label="Telefone" value={profile?.phone} />
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <a href="/passport" className="flex items-center gap-3 p-4 hover:bg-muted/50">
          <Shield className="w-5 h-5 text-red-500" />
          <div className="flex-1">
            <p className="font-semibold text-sm">Perfil de Emergência</p>
            <p className="text-xs text-muted-foreground">Alergias, medicamentos, plano e contato de emergência</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </a>
      </div>

      <button
        onClick={handleLogout}
        className="w-full py-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
      >
        Sair da conta
      </button>
    </div>
  )
}

function Input({ label, type, value, onChange }: any) {
  return (
    <div>
      <label className="text-sm font-medium mb-1 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background"
      />
    </div>
  )
}

function Select({ label, value, onChange, options }: any) {
  return (
    <div>
      <label className="text-sm font-medium mb-1 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background"
      >
        {options.map(([value, label]: string[]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </div>
  )
}

function Textarea({ label, value, onChange, placeholder }: any) {
  return (
    <div>
      <label className="text-sm font-medium mb-1 block">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background min-h-[80px]"
      />
    </div>
  )
}

function Info({ icon: Icon, label, value }: any) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-5 h-5 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value || 'Não informado'}</p>
      </div>
    </div>
  )
}
