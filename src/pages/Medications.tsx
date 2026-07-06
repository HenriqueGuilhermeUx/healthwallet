import { useState, useEffect } from 'react'
import { Pill, Plus, Clock, Trash2, Calendar, Bell, CheckCircle, Users, Package, TimerReset } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { createMedicalEvent } from '@/services/medicalTimeline'

interface Medication {
  id: string
  name: string
  dosage: string
  frequency: string
  start_date?: string
  end_date?: string
  reminder_time?: string
  is_active: boolean
  target_family_member_id?: string | null
  target_name?: string
  notify_caregivers?: boolean
  critical_medication?: boolean
  stock_quantity?: number | null
  pills_per_day?: number | null
  stock_alert_threshold?: number | null
  last_taken_at?: string | null
}

interface FamilyMember {
  id: string
  name: string
  relationship?: string
  notify_medications?: boolean
}

const emptyForm = {
  name: '',
  dosage: '',
  frequency: '',
  reminder_time: '',
  start_date: '',
  end_date: '',
  target_family_member_id: 'self',
  notify_caregivers: false,
  critical_medication: false,
  stock_quantity: '',
  pills_per_day: '',
  stock_alert_threshold: '5',
}

export default function Medications() {
  const { user } = useAuth()
  const [medications, setMedications] = useState<Medication[]>([])
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<any>(emptyForm)

  useEffect(() => {
    loadData()
  }, [user])

  async function loadData() {
    if (!user) return

    setLoading(true)

    try {
      const [medsRes, familyRes] = await Promise.all([
        supabase
          .from('medications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('family_members')
          .select('id,name,relationship,notify_medications')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ])

      setMedications(medsRes.data || [])
      setFamilyMembers(familyRes.data || [])
    } catch (error) {
      console.error('Error loading medications:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddMedication() {
    if (!user || !formData.name) {
      alert('Informe o nome do medicamento')
      return
    }

    const targetMember = familyMembers.find((item) => item.id === formData.target_family_member_id)
    const targetName = targetMember?.name || 'Eu'
    const targetFamilyMemberId = formData.target_family_member_id === 'self' ? null : formData.target_family_member_id

    try {
      const { data, error } = await supabase
        .from('medications')
        .insert({
          user_id: user.id,
          target_user_id: user.id,
          target_family_member_id: targetFamilyMemberId,
          target_name: targetName,
          name: formData.name,
          dosage: formData.dosage,
          frequency: formData.frequency,
          reminder_time: formData.reminder_time || null,
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
          notify_caregivers: formData.notify_caregivers,
          critical_medication: formData.critical_medication,
          stock_quantity: formData.stock_quantity ? Number(formData.stock_quantity) : null,
          pills_per_day: formData.pills_per_day ? Number(formData.pills_per_day) : null,
          stock_alert_threshold: formData.stock_alert_threshold ? Number(formData.stock_alert_threshold) : 5,
          is_active: true,
        })
        .select()
        .single()

      if (error) throw error

      await createMedicalEvent({
        userId: user.id,
        type: 'medication',
        title: `${targetName}: ${formData.name}`,
        description: [
          formData.dosage ? `Dosagem: ${formData.dosage}` : '',
          formData.frequency ? `Frequência: ${formData.frequency}` : '',
          formData.reminder_time ? `Horário: ${formData.reminder_time}` : '',
          formData.notify_caregivers ? 'Alertar familiares/cuidadores' : '',
        ].filter(Boolean).join(' · '),
        eventDate: formData.start_date || new Date().toISOString().slice(0, 10),
      })

      if (formData.reminder_time) {
        await supabase.from('health_reminders').insert({
          user_id: user.id,
          target_family_member_id: targetFamilyMemberId,
          type: 'medication',
          title: `Tomar ${formData.name}`,
          description: [
            targetName !== 'Eu' ? `Paciente: ${targetName}` : '',
            formData.dosage ? `Dosagem: ${formData.dosage}` : '',
            formData.frequency ? `Frequência: ${formData.frequency}` : '',
            formData.notify_caregivers ? 'Alertar cuidadores se não confirmar' : '',
          ].filter(Boolean).join(' · '),
          reminder_date: formData.start_date || new Date().toISOString().slice(0, 10),
          reminder_time: formData.reminder_time,
          frequency: normalizeFrequency(formData.frequency),
          requires_confirmation: true,
          is_done: false,
          is_active: true,
        })
      }

      setShowAddForm(false)
      setFormData(emptyForm)
      loadData()
    } catch (error: any) {
      console.error('Error adding medication:', error)
      alert(error.message || 'Erro ao adicionar medicamento. Rode o SQL_FAMILIA_IDOSOS_FASE1.sql no Supabase se ainda não rodou.')
    }
  }

  async function confirmMedication(med: Medication, status: 'taken' | 'delayed' | 'skipped') {
    if (!user) return

    setSavingId(med.id)

    try {
      const now = new Date().toISOString()
      const statusText = status === 'taken' ? 'tomado' : status === 'delayed' ? 'adiado' : 'não tomado'

      await supabase.from('medication_confirmations').insert({
        user_id: user.id,
        medication_id: med.id,
        target_family_member_id: med.target_family_member_id || null,
        status,
        confirmed_by_user_id: user.id,
        confirmed_at: now,
      })

      if (status === 'taken') {
        await supabase
          .from('medications')
          .update({ last_taken_at: now, updated_at: now })
          .eq('id', med.id)
      }

      await createMedicalEvent({
        userId: user.id,
        type: 'medication_confirmation',
        title: `${med.target_name || 'Eu'}: medicamento ${statusText}`,
        description: `${med.name}${med.dosage ? ` · ${med.dosage}` : ''}`,
      })

      loadData()
    } catch (error: any) {
      console.error(error)
      alert(error.message || 'Erro ao confirmar medicamento')
    } finally {
      setSavingId(null)
    }
  }

  async function handleToggleActive(id: string, currentStatus: boolean) {
    await supabase
      .from('medications')
      .update({ is_active: !currentStatus, updated_at: new Date().toISOString() })
      .eq('id', id)

    loadData()
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja excluir este medicamento?')) return

    await supabase.from('medications').delete().eq('id', id)
    loadData()
  }

  const activeMeds = medications.filter((m) => m.is_active)
  const inactiveMeds = medications.filter((m) => !m.is_active)
  const caregiverAlerts = activeMeds.filter((m) => m.notify_caregivers).length

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-orange-600 to-amber-700 text-white p-5">
        <div className="flex items-center gap-3">
          <Pill className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Medicamentos</h1>
            <p className="text-white/80 text-sm">
              Lembretes, confirmação, estoque e alertas para familiares/cuidadores.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Ativos" value={activeMeds.length} />
        <Stat label="Com alerta" value={caregiverAlerts} />
        <Stat label="Família" value={familyMembers.length} />
      </div>

      <section className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
        <strong>Novo:</strong> agora cada medicamento pode ser do próprio usuário ou de um familiar/idoso. O paciente confirma “Tomei”, e familiares/cuidadores podem ser avisados quando o cuidado exigir acompanhamento.
      </section>

      <button
        onClick={() => setShowAddForm(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold"
      >
        <Plus className="w-5 h-5" />
        Adicionar medicamento
      </button>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : medications.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-dashed">
          <Pill className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Nenhum medicamento</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Adicione medicamentos para criar lembretes e acompanhar adesão.
          </p>
          <button onClick={() => setShowAddForm(true)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">
            Adicionar
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {activeMeds.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-2">Em uso ({activeMeds.length})</h2>
              <div className="space-y-2">
                {activeMeds.map((med) => (
                  <MedicationCard
                    key={med.id}
                    med={med}
                    active
                    saving={savingId === med.id}
                    onConfirm={(status: 'taken' | 'delayed' | 'skipped') => confirmMedication(med, status)}
                    onToggle={() => handleToggleActive(med.id, med.is_active)}
                    onDelete={() => handleDelete(med.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {inactiveMeds.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-2 text-muted-foreground">Inativos ({inactiveMeds.length})</h2>
              <div className="space-y-2 opacity-70">
                {inactiveMeds.map((med) => (
                  <MedicationCard
                    key={med.id}
                    med={med}
                    active={false}
                    saving={savingId === med.id}
                    onConfirm={(status: 'taken' | 'delayed' | 'skipped') => confirmMedication(med, status)}
                    onToggle={() => handleToggleActive(med.id, med.is_active)}
                    onDelete={() => handleDelete(med.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-bold">Adicionar Medicamento</h2>
              <button onClick={() => setShowAddForm(false)} className="text-muted-foreground">✕</button>
            </div>

            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="text-sm font-medium mb-1 block">Para quem?</label>
                <select value={formData.target_family_member_id} onChange={(e) => setFormData({ ...formData, target_family_member_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-border bg-background">
                  <option value="self">Eu</option>
                  {familyMembers.map((member) => (
                    <option key={member.id} value={member.id}>{member.name} {member.relationship ? `(${member.relationship})` : ''}</option>
                  ))}
                </select>
              </div>

              <Input label="Nome do medicamento *" value={formData.name} onChange={(v: string) => setFormData({ ...formData, name: v })} placeholder="Ex: Losartana" />
              <Input label="Dosagem" value={formData.dosage} onChange={(v: string) => setFormData({ ...formData, dosage: v })} placeholder="Ex: 50mg" />
              <Input label="Frequência" value={formData.frequency} onChange={(v: string) => setFormData({ ...formData, frequency: v })} placeholder="Ex: 1x ao dia, 2x ao dia, de 8 em 8h..." />

              <div>
                <label className="text-sm font-medium mb-1 block">Horário principal</label>
                <input type="time" value={formData.reminder_time} onChange={(e) => setFormData({ ...formData, reminder_time: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-border bg-background" />
                <p className="text-xs text-muted-foreground mt-1">Se preencher horário, será criado um lembrete com confirmação.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <DateInput label="Início" value={formData.start_date} onChange={(v: string) => setFormData({ ...formData, start_date: v })} />
                <DateInput label="Fim" value={formData.end_date} onChange={(v: string) => setFormData({ ...formData, end_date: v })} />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <NumberInput label="Estoque" value={formData.stock_quantity} onChange={(v: string) => setFormData({ ...formData, stock_quantity: v })} />
                <NumberInput label="Uso/dia" value={formData.pills_per_day} onChange={(v: string) => setFormData({ ...formData, pills_per_day: v })} />
                <NumberInput label="Avisar com" value={formData.stock_alert_threshold} onChange={(v: string) => setFormData({ ...formData, stock_alert_threshold: v })} />
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Check label="Alertar familiares/cuidadores" checked={formData.notify_caregivers} onChange={(v: boolean) => setFormData({ ...formData, notify_caregivers: v })} />
                <Check label="Medicamento crítico" checked={formData.critical_medication} onChange={(v: boolean) => setFormData({ ...formData, critical_medication: v })} />
              </div>

              <button onClick={handleAddMedication} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold">
                Salvar medicamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MedicationCard({ med, active, saving, onConfirm, onToggle, onDelete }: any) {
  const stockDays = calculateStockDays(med.stock_quantity, med.pills_per_day)
  const lowStock = typeof stockDays === 'number' && stockDays <= Number(med.stock_alert_threshold || 5)

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${active ? 'bg-orange-100' : 'bg-gray-100'}`}>
          <Pill className={`w-5 h-5 ${active ? 'text-orange-600' : 'text-gray-500'}`} />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold">{med.name}</p>
            {med.critical_medication && <Badge text="Crítico" tone="red" />}
          </div>

          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Users className="w-3 h-3" />
            {med.target_name || 'Eu'}
          </p>

          {med.dosage && <p className="text-sm text-muted-foreground mt-1">{med.dosage}</p>}

          {med.frequency && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {med.frequency}
            </p>
          )}

          {med.reminder_time && (
            <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
              <Bell className="w-3 h-3" /> Lembrete às {String(med.reminder_time).slice(0, 5)}
            </p>
          )}

          {(med.start_date || med.end_date) && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {med.start_date ? formatDate(med.start_date) : 'Início não informado'}
              {med.end_date ? ` até ${formatDate(med.end_date)}` : ''}
            </p>
          )}

          {med.notify_caregivers && (
            <p className="text-xs text-blue-700 mt-1 flex items-center gap-1">
              <Users className="w-3 h-3" /> Familiares/cuidadores acompanham este cuidado
            </p>
          )}

          {typeof stockDays === 'number' && (
            <div className={`mt-3 rounded-lg p-2 text-xs flex items-center gap-2 ${lowStock ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              <Package className="w-4 h-4" />
              Estoque estimado: {stockDays} dia(s){lowStock ? ' · precisa comprar em breve' : ''}
            </div>
          )}

          {med.last_taken_at && (
            <p className="text-xs text-muted-foreground mt-2">
              Última confirmação: {new Date(med.last_taken_at).toLocaleString('pt-BR')}
            </p>
          )}

          {active && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              <button disabled={saving} onClick={() => onConfirm('taken')} className="py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50">
                <CheckCircle className="w-3 h-3" /> Tomei
              </button>
              <button disabled={saving} onClick={() => onConfirm('delayed')} className="py-2 rounded-lg bg-amber-100 text-amber-700 text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50">
                <TimerReset className="w-3 h-3" /> Adiar
              </button>
              <button disabled={saving} onClick={() => onConfirm('skipped')} className="py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold disabled:opacity-50">
                Pulei
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <button onClick={onToggle} className={`text-xs ${active ? 'text-emerald-600' : 'text-muted-foreground'}`}>
            {active ? 'Ativo' : 'Reativar'}
          </button>
          <button onClick={onDelete} className="text-red-500">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: any) {
  return (
    <div className="bg-white rounded-xl border p-3 text-center">
      <p className="text-2xl font-bold text-orange-700">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function Badge({ text, tone = 'emerald' }: any) {
  const cls = tone === 'red' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>{text}</span>
}

function Input({ label, value, onChange, placeholder = '' }: any) {
  return (
    <div>
      <label className="text-sm font-medium mb-1 block">{label}</label>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background" />
    </div>
  )
}

function NumberInput({ label, value, onChange }: any) {
  return (
    <div>
      <label className="text-xs font-medium mb-1 block">{label}</label>
      <input type="number" min="0" value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background" />
    </div>
  )
}

function DateInput({ label, value, onChange }: any) {
  return (
    <div>
      <label className="text-sm font-medium mb-1 block">{label}</label>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background" />
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

function normalizeFrequency(value: string) {
  const text = (value || '').toLowerCase()
  if (text.includes('2x') || text.includes('duas') || text.includes('12')) return 'twice_daily'
  if (text.includes('8 em 8') || text.includes('3x')) return 'three_times_daily'
  if (text.includes('semana')) return 'weekly'
  if (text.includes('mês') || text.includes('mes')) return 'monthly'
  return 'daily'
}

function calculateStockDays(stock?: number | null, perDay?: number | null) {
  if (!stock || !perDay || perDay <= 0) return null
  return Math.floor(Number(stock) / Number(perDay))
}

function formatDate(date: string) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('pt-BR')
}
