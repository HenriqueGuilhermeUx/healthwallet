import { useEffect, useState } from 'react'
import { Heart, Calendar, Baby, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

export default function WomensHealth() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    last_menstrual_period: '',
    cycle_length: '28',
    is_pregnant: false,
    pregnancy_week: '',
    menopause_status: '',
    contraception_method: '',
    last_pap_smear: '',
    last_mammogram: '',
    last_breast_exam: '',
    notes: '',
  })

  useEffect(() => {
    load()
  }, [user])

  async function load() {
    if (!user) return

    const { data } = await supabase
      .from('womens_health_records')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (data) {
      setForm({
        last_menstrual_period: data.last_menstrual_period || '',
        cycle_length: data.cycle_length ? String(data.cycle_length) : '28',
        is_pregnant: !!data.is_pregnant,
        pregnancy_week: data.pregnancy_week ? String(data.pregnancy_week) : '',
        menopause_status: data.menopause_status || '',
        contraception_method: data.contraception_method || '',
        last_pap_smear: data.last_pap_smear || '',
        last_mammogram: data.last_mammogram || '',
        last_breast_exam: data.last_breast_exam || '',
        notes: data.notes || '',
      })
    }

    setLoading(false)
  }

  async function save() {
    if (!user) return

    const payload = {
      user_id: user.id,
      last_menstrual_period: form.last_menstrual_period || null,
      cycle_length: form.cycle_length ? Number(form.cycle_length) : 28,
      is_pregnant: form.is_pregnant,
      pregnancy_week: form.pregnancy_week ? Number(form.pregnancy_week) : null,
      menopause_status: form.menopause_status || null,
      contraception_method: form.contraception_method || null,
      last_pap_smear: form.last_pap_smear || null,
      last_mammogram: form.last_mammogram || null,
      last_breast_exam: form.last_breast_exam || null,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('womens_health_records')
      .upsert(payload, { onConflict: 'user_id' })

    if (error) {
      alert('Erro ao salvar saúde da mulher')
      return
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Carregando...</div>
  }

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-pink-600 to-rose-600 text-white p-5">
        <div className="flex items-center gap-3">
          <Heart className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Saúde da Mulher</h1>
            <p className="text-white/80 text-sm">
              Ciclo, prevenção, gravidez e exames femininos
            </p>
          </div>
        </div>
      </div>

      <Section icon={Calendar} title="Ciclo menstrual">
        <Input label="Última menstruação" type="date" value={form.last_menstrual_period} onChange={(v) => setForm({ ...form, last_menstrual_period: v })} />
        <Input label="Duração média do ciclo em dias" type="number" value={form.cycle_length} onChange={(v) => setForm({ ...form, cycle_length: v })} />
      </Section>

      <Section icon={Baby} title="Gravidez / menopausa">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_pregnant}
            onChange={(e) => setForm({ ...form, is_pregnant: e.target.checked })}
          />
          Estou grávida
        </label>

        {form.is_pregnant && (
          <Input label="Semana da gestação" type="number" value={form.pregnancy_week} onChange={(v) => setForm({ ...form, pregnancy_week: v })} />
        )}

        <Select label="Status menopausa" value={form.menopause_status} onChange={(v) => setForm({ ...form, menopause_status: v })} options={[
          ['', 'Selecione'],
          ['none', 'Não estou na menopausa'],
          ['perimenopause', 'Perimenopausa'],
          ['menopause', 'Menopausa'],
          ['postmenopause', 'Pós-menopausa'],
        ]} />

        <Input label="Método contraceptivo" type="text" value={form.contraception_method} onChange={(v) => setForm({ ...form, contraception_method: v })} />
      </Section>

      <Section icon={ShieldCheck} title="Prevenção">
        <Input label="Último Papanicolau" type="date" value={form.last_pap_smear} onChange={(v) => setForm({ ...form, last_pap_smear: v })} />
        <Input label="Última mamografia" type="date" value={form.last_mammogram} onChange={(v) => setForm({ ...form, last_mammogram: v })} />
        <Input label="Último exame das mamas" type="date" value={form.last_breast_exam} onChange={(v) => setForm({ ...form, last_breast_exam: v })} />
      </Section>

      <Section icon={Heart} title="Observações">
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Cólicas, sintomas, alterações, histórico ginecológico..."
          className="w-full min-h-[100px] rounded-xl border border-border bg-background p-3 text-sm"
        />
      </Section>

      <button
        onClick={save}
        className="w-full py-3 rounded-xl bg-pink-600 text-white font-semibold"
      >
        {saved ? 'Salvo!' : 'Salvar Saúde da Mulher'}
      </button>
    </div>
  )
}

function Section({ icon: Icon, title, children }: any) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-pink-600" />
        <h2 className="font-bold">{title}</h2>
      </div>
      {children}
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
