import { useState, useEffect } from 'react'
import { Pill, Plus, Clock, Trash2, Calendar, Bell } from 'lucide-react'
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
}

export default function Medications() {
  const { user } = useAuth()
  const [medications, setMedications] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    dosage: '',
    frequency: '',
    reminder_time: '',
    start_date: '',
    end_date: '',
  })

  useEffect(() => {
    loadMedications()
  }, [user])

  async function loadMedications() {
    if (!user) return

    try {
      const { data } = await supabase
        .from('medications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setMedications(data || [])
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

    try {
      const { data, error } = await supabase
        .from('medications')
        .insert({
          user_id: user.id,
          name: formData.name,
          dosage: formData.dosage,
          frequency: formData.frequency,
          reminder_time: formData.reminder_time || null,
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
          is_active: true,
        })
        .select()
        .single()

      if (error) throw error

      await createMedicalEvent({
        userId: user.id,
        type: 'medication',
        title: `Medicamento: ${formData.name}`,
        description: [
          formData.dosage ? `Dosagem: ${formData.dosage}` : '',
          formData.frequency ? `Frequência: ${formData.frequency}` : '',
          formData.reminder_time ? `Horário: ${formData.reminder_time}` : '',
          formData.start_date ? `Início: ${formatDate(formData.start_date)}` : '',
          formData.end_date ? `Fim: ${formatDate(formData.end_date)}` : '',
        ].filter(Boolean).join(' · '),
        eventDate: formData.start_date || new Date().toISOString().slice(0, 10),
      })

      if (formData.reminder_time) {
        await supabase.from('health_reminders').insert({
          user_id: user.id,
          type: 'medication',
          title: `Tomar ${formData.name}`,
          description: [
            formData.dosage ? `Dosagem: ${formData.dosage}` : '',
            formData.frequency ? `Frequência: ${formData.frequency}` : '',
          ].filter(Boolean).join(' · '),
          reminder_date: formData.start_date || new Date().toISOString().slice(0, 10),
          reminder_time: formData.reminder_time,
          frequency: normalizeFrequency(formData.frequency),
          is_done: false,
          is_active: true,
        })
      }

      setShowAddForm(false)

      setFormData({
        name: '',
        dosage: '',
        frequency: '',
        reminder_time: '',
        start_date: '',
        end_date: '',
      })

      loadMedications()
    } catch (error) {
      console.error('Error adding medication:', error)
      alert('Erro ao adicionar medicamento')
    }
  }

  async function handleToggleActive(id: string, currentStatus: boolean) {
    await supabase
      .from('medications')
      .update({ is_active: !currentStatus })
      .eq('id', id)

    loadMedications()
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja excluir este medicamento?')) return

    await supabase.from('medications').delete().eq('id', id)
    loadMedications()
  }

  const activeMeds = medications.filter((m) => m.is_active)
  const inactiveMeds = medications.filter((m) => !m.is_active)

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 text-white p-5">
        <div className="flex items-center gap-3">
          <Pill className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Medicamentos</h1>
            <p className="text-white/80 text-sm">
              Tratamentos, horários, lembretes e histórico.
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={() => setShowAddForm(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold"
      >
        <Plus className="w-5 h-5" />
        Adicionar medicamento
      </button>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Carregando...
        </div>
      ) : medications.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-dashed">
          <Pill className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Nenhum medicamento</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Adicione seus medicamentos para acompanhamento na Agenda de Saúde.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm"
          >
            Adicionar
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {activeMeds.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-2">
                Em uso ({activeMeds.length})
              </h2>

              <div className="space-y-2">
                {activeMeds.map((med) => (
                  <MedicationCard
                    key={med.id}
                    med={med}
                    active
                    onToggle={() => handleToggleActive(med.id, med.is_active)}
                    onDelete={() => handleDelete(med.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {inactiveMeds.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-2 text-muted-foreground">
                Inativos ({inactiveMeds.length})
              </h2>

              <div className="space-y-2 opacity-70">
                {inactiveMeds.map((med) => (
                  <MedicationCard
                    key={med.id}
                    med={med}
                    active={false}
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
              <button
                onClick={() => setShowAddForm(false)}
                className="text-muted-foreground"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              <Input
                label="Nome do medicamento *"
                value={formData.name}
                onChange={(v: string) => setFormData({ ...formData, name: v })}
                placeholder="Ex: Losartana"
              />

              <Input
                label="Dosagem"
                value={formData.dosage}
                onChange={(v: string) => setFormData({ ...formData, dosage: v })}
                placeholder="Ex: 50mg"
              />

              <Input
                label="Frequência"
                value={formData.frequency}
                onChange={(v: string) => setFormData({ ...formData, frequency: v })}
                placeholder="Ex: 1x ao dia, 2x ao dia, de 8 em 8h..."
              />

              <div>
                <label className="text-sm font-medium mb-1 block">
                  Horário principal
                </label>
                <input
                  type="time"
                  value={formData.reminder_time}
                  onChange={(e) => setFormData({ ...formData, reminder_time: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Se preencher horário, será criado um lembrete automático.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Início
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Fim
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  />
                </div>
              </div>

              <button
                onClick={handleAddMedication}
                className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold"
              >
                Salvar medicamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MedicationCard({ med, active, onToggle, onDelete }: any) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          active ? 'bg-orange-100' : 'bg-gray-100'
        }`}>
          <Pill className={`w-5 h-5 ${active ? 'text-orange-600' : 'text-gray-500'}`} />
        </div>

        <div className="flex-1">
          <p className="font-semibold">{med.name}</p>

          {med.dosage && (
            <p className="text-sm text-muted-foreground">{med.dosage}</p>
          )}

          {med.frequency && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {med.frequency}
            </p>
          )}

          {med.reminder_time && (
            <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
              <Bell className="w-3 h-3" />
              Lembrete às {String(med.reminder_time).slice(0, 5)}
            </p>
          )}

          {(med.start_date || med.end_date) && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {med.start_date ? formatDate(med.start_date) : 'Início não informado'}
              {med.end_date ? ` até ${formatDate(med.end_date)}` : ''}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            onClick={onToggle}
            className={`text-xs ${active ? 'text-emerald-600' : 'text-muted-foreground'}`}
          >
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

function Input({ label, value, onChange, placeholder }: any) {
  return (
    <div>
      <label className="text-sm font-medium mb-1 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background"
      />
    </div>
  )
}

function normalizeFrequency(value: string) {
  const text = String(value || '').toLowerCase()

  if (text.includes('dia') || text.includes('diário') || text.includes('diaria')) return 'daily'
  if (text.includes('semana')) return 'weekly'
  if (text.includes('mês') || text.includes('mes')) return 'monthly'

  return 'once'
}

function formatDate(date: string) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('pt-BR')
}
