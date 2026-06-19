import { useEffect, useState } from 'react'
import { Heart, Calendar, Baby, ShieldCheck, Save, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

export default function WomensHealth() {
  const { user } = useAuth()
  const [allowed, setAllowed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    last_period_date: '',
    average_cycle_days: '',
    is_pregnant: false,
    pregnancy_weeks: '',
    menopause_status: '',
    last_preventive_exam: '',
    last_mammogram: '',
    contraceptive_method: '',
    notes: '',
  })

  useEffect(() => {
    load()
  }, [user])

  async function load() {
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('gender')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.gender !== 'female') {
      setAllowed(false)
      setLoading(false)
      return
    }

    setAllowed(true)

    const { data } = await supabase
      .from('womens_health')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (data) {
      setForm({
        last_period_date: data.last_period_date || '',
        average_cycle_days: data.average_cycle_days ? String(data.average_cycle_days) : '',
        is_pregnant: Boolean(data.is_pregnant),
        pregnancy_weeks: data.pregnancy_weeks ? String(data.pregnancy_weeks) : '',
        menopause_status: data.menopause_status || '',
        last_preventive_exam: data.last_preventive_exam || '',
        last_mammogram: data.last_mammogram || '',
        contraceptive_method: data.contraceptive_method || '',
        notes: data.notes || '',
      })
    }

    setLoading(false)
  }

  async function save() {
    if (!user) return

    setSaving(true)

    const { error } = await supabase.from('womens_health').upsert(
      {
        user_id: user.id,
        last_period_date: form.last_period_date || null,
        average_cycle_days: form.average_cycle_days ? Number(form.average_cycle_days) : null,
        is_pregnant: form.is_pregnant,
        pregnancy_weeks: form.pregnancy_weeks ? Number(form.pregnancy_weeks) : null,
        menopause_status: form.menopause_status || null,
        last_preventive_exam: form.last_preventive_exam || null,
        last_mammogram: form.last_mammogram || null,
        contraceptive_method: form.contraceptive_method || null,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    setSaving(false)

    if (error) {
      alert('Erro ao salvar informações')
      return
    }

    alert('Informações salvas!')
  }

  if (loading) {
    return <div className="p-4">Carregando...</div>
  }

  if (!allowed) {
    return (
      <div className="p-4 pb-20 space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-700" />
          <p className="text-sm text-yellow-800">
            Esta área é exibida apenas para perfis cadastrados como sexo feminino.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-pink-600 to-rose-700 text-white p-5">
        <div className="flex items-center gap-3">
          <Heart className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Saúde da Mulher</h1>
            <p className="text-white/80 text-sm">
              Ciclo, prevenção, gestação, menopausa e exames importantes.
            </p>
          </div>
        </div>
      </div>

      <Section icon={Calendar} title="Ciclo menstrual">
        <Input label="Data da última menstruação" type="date" value={form.last_period_date} onChange={(v: string) => setForm({ ...form, last_period_date: v })} />
        <Input label="Duração média do ciclo em dias" type="number" placeholder="Ex: 28" value={form.average_cycle_days} onChange={(v: string) => setForm({ ...form, average_cycle_days: v })} />
      </Section>

      <Section icon={Baby} title="Gestação / Menopausa">
        <label className="flex items-center gap-2 text-sm mb-3">
          <input
            type="checkbox"
            checked={form.is_pregnant}
            onChange={(e) => setForm({ ...form, is_pregnant: e.target.checked })}
          />
          Estou gestante
        </label>

        {form.is_pregnant && (
          <Input label="Semanas de gestação" type="number" value={form.pregnancy_weeks} onChange={(v: string) => setForm({ ...form, pregnancy_weeks: v })} />
        )}

        <label className="text-sm font-medium mb-1 block">Fase atual</label>
        <select
          value={form.menopause_status}
          onChange={(e) => setForm({ ...form, menopause_status: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border bg-background"
        >
          <option value="">Não informado</option>
          <option value="regular_cycle">Ciclo regular</option>
          <option value="irregular_cycle">Ciclo irregular</option>
          <option value="perimenopause">Perimenopausa</option>
          <option value="menopause">Menopausa</option>
          <option value="postmenopause">Pós-menopausa</option>
        </select>
      </Section>

      <Section icon={ShieldCheck} title="Prevenção e exames">
        <Input label="Último preventivo / Papanicolau" type="date" value={form.last_preventive_exam} onChange={(v: string) => setForm({ ...form, last_preventive_exam: v })} />
        <Input label="Última mamografia" type="date" value={form.last_mammogram} onChange={(v: string) => setForm({ ...form, last_mammogram: v })} />
        <Input label="Método contraceptivo" placeholder="Ex: DIU, pílula, nenhum..." value={form.contraceptive_method} onChange={(v: string) => setForm({ ...form, contraceptive_method: v })} />

        <div className="bg-pink-50 border border-pink-200 rounded-xl p-3 text-xs text-pink-800 mt-3">
          Exames que podem fazer parte do acompanhamento feminino: preventivo/Papanicolau, mamografia, ultrassom transvaginal, exames hormonais, densitometria óssea e exames pré-natais quando aplicável.
        </div>
      </Section>

      <Section icon={Heart} title="Observações">
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Sintomas, cólicas, fluxo, histórico ginecológico, dúvidas..."
          className="w-full px-3 py-2 rounded-lg border bg-background min-h-[100px]"
        />
      </Section>

      <button
        onClick={save}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-pink-600 text-white font-semibold disabled:opacity-60"
      >
        <Save className="w-5 h-5" />
        {saving ? 'Salvando...' : 'Salvar informações'}
      </button>
    </div>
  )
}

function Section({ icon: Icon, title, children }: any) {
  return (
    <section className="bg-white rounded-xl border p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5 text-pink-600" />
        <h2 className="font-bold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Input({ label, value, onChange, type = 'text', placeholder = '' }: any) {
  return (
    <div className="mb-3">
      <label className="text-sm font-medium mb-1 block">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border bg-background"
      />
    </div>
  )
}
