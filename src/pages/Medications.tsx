import { useState, useEffect } from 'react'
import { Pill, Plus, Clock, CheckCircle, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

interface Medication {
  id: string
  name: string
  dosage: string
  frequency: string
  start_date?: string
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
  })

  useEffect(() => {
    loadMedications()
  }, [user])

  const loadMedications = async () => {
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

  const handleAddMedication = async () => {
    if (!user || !formData.name) return

    try {
      await supabase.from('medications').insert({
        user_id: user.id,
        ...formData,
        is_active: true,
      })
      setShowAddForm(false)
      setFormData({ name: '', dosage: '', frequency: '' })
      loadMedications()
    } catch (error) {
      console.error('Error adding medication:', error)
    }
  }

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    await supabase.from('medications').update({ is_active: !currentStatus }).eq('id', id)
    loadMedications()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este medicamento?')) return
    await supabase.from('medications').delete().eq('id', id)
    loadMedications()
  }

  const activeMeds = medications.filter(m => m.is_active)
  const inactiveMeds = medications.filter(m => !m.is_active)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Medicamentos</h1>
          <p className="text-sm text-muted-foreground">Seu tratamento em dia</p>
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
      ) : medications.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-dashed">
          <Pill className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Nenhum medicamento</h3>
          <p className="text-sm text-muted-foreground mb-4">Adicione seus medicamentos para acompanhamento</p>
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
                  <div key={med.id} className="bg-card rounded-xl border border-border p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                        <Pill className="w-5 h-5 text-orange-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{med.name}</p>
                        <p className="text-sm text-muted-foreground">{med.dosage}</p>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {med.frequency}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleToggleActive(med.id, med.is_active)} className="text-xs text-emerald-600">
                          Ativo
                        </button>
                        <button onClick={() => handleDelete(med.id)} className="text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {inactiveMeds.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-2 text-muted-foreground">Inativos ({inactiveMeds.length})</h2>
              <div className="space-y-2 opacity-60">
                {inactiveMeds.map((med) => (
                  <div key={med.id} className="bg-card rounded-xl border border-border p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Pill className="w-5 h-5 text-gray-500" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{med.name}</p>
                        <p className="text-sm text-muted-foreground">{med.dosage}</p>
                      </div>
                      <button onClick={() => handleToggleActive(med.id, med.is_active)} className="text-xs text-muted-foreground">
                        Reativar
                      </button>
                    </div>
                  </div>
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
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Nome do Medicamento *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Losartana"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Dosagem</label>
                <input
                  type="text"
                  value={formData.dosage}
                  onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                  placeholder="Ex: 50mg"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Frequência</label>
                <input
                  type="text"
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                  placeholder="Ex: 1x ao dia"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </div>
              <button
                onClick={handleAddMedication}
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