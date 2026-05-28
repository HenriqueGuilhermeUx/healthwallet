import { useState, useEffect } from 'react'
import { Wallet, Plus, CreditCard, Shield, ChevronRight, Trash2, Copy, Check } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

interface HealthPlan {
  id: string
  plan_name: string
  plan_type: 'private' | 'sus'
  card_number: string
  operator_name?: string
  beneficiary_name: string
  validity?: string
}

export default function HealthWallet() {
  const { user } = useAuth()
  const [plans, setPlans] = useState<HealthPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    plan_name: '',
    plan_type: 'private' as 'private' | 'sus',
    card_number: '',
    operator_name: '',
    beneficiary_name: user?.user_metadata?.full_name || user?.user_metadata?.name || '',
    validity: '',
  })

  useEffect(() => {
    loadPlans()
  }, [user])

  const loadPlans = async () => {
    if (!user) return
    try {
      const { data } = await supabase
        .from('health_plans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      setPlans(data || [])
    } catch (error) {
      console.error('Error loading plans:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddPlan = async () => {
    if (!user || !formData.plan_name || !formData.card_number || !formData.beneficiary_name) {
      alert('Preencha os campos obrigatórios')
      return
    }

    try {
      const { error } = await supabase
        .from('health_plans')
        .insert({
          user_id: user.id,
          ...formData,
        })

      if (error) throw error

      setShowAddForm(false)
      setFormData({
        plan_name: '',
        plan_type: 'private',
        card_number: '',
        operator_name: '',
        beneficiary_name: user?.user_metadata?.full_name || '',
        validity: '',
      })
      loadPlans()
    } catch (error) {
      console.error('Error adding plan:', error)
      alert('Erro ao adicionar carteirinha')
    }
  }

  const handleDeletePlan = async (id: string) => {
    if (!confirm('Deseja excluir esta carteirinha?')) return

    try {
      await supabase.from('health_plans').delete().eq('id', id)
      loadPlans()
    } catch (error) {
      console.error('Error deleting plan:', error)
    }
  }

  const copyCardNumber = (id: string, number: string) => {
    navigator.clipboard.writeText(number)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const formatCardNumber = (num: string) => {
    return num.replace(/(\d{4})(?=\d)/g, '$1 ')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Wallet de Saúde</h1>
          <p className="text-sm text-muted-foreground">Suas carteirinhas de plano de saúde</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Plans List */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : plans.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-border">
          <Wallet className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Nenhuma carteirinha</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Adicione sua carteirinha do plano de saúde ou SUS
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            Adicionar carteirinha
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl p-5 text-white relative overflow-hidden ${
                plan.plan_type === 'sus'
                  ? 'bg-gradient-to-br from-blue-600 to-blue-800'
                  : 'bg-gradient-to-br from-indigo-600 to-purple-700'
              }`}
            >
              {/* Pattern overlay */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white transform translate-x-8 -translate-y-8" />
                <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white transform -translate-x-6 translate-y-6" />
              </div>

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1">
                      {plan.plan_type === 'sus' ? 'SUS - Sistema Único de Saúde' : 'Plano de Saúde'}
                    </p>
                    <p className="font-bold text-lg">{plan.plan_name}</p>
                    {plan.operator_name && (
                      <p className="text-white/70 text-sm">{plan.operator_name}</p>
                    )}
                  </div>
                  <Shield className="w-6 h-6 text-white/50" />
                </div>

                <p className="font-mono text-lg tracking-widest mb-2">
                  {formatCardNumber(plan.card_number)}
                </p>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/70 text-xs">Titular</p>
                    <p className="text-sm font-medium">{plan.beneficiary_name}</p>
                  </div>
                  {plan.validity && (
                    <div>
                      <p className="text-white/70 text-xs">Validade</p>
                      <p className="text-sm font-medium">{plan.validity}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={() => copyCardNumber(plan.id, plan.card_number)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-sm"
                  >
                    {copiedId === plan.id ? (
                      <><Check className="w-4 h-4" /> Copiado!</>
                    ) : (
                      <><Copy className="w-4 h-4" /> Copiar número</>
                    )}
                  </button>
                  <button
                    onClick={() => handleDeletePlan(plan.id)}
                    className="w-10 h-10 rounded-lg bg-white/20 hover:bg-white/30 transition-colors flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-bold">Adicionar Carteirinha</h2>
              <button onClick={() => setShowAddForm(false)} className="text-muted-foreground">
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="text-sm font-medium mb-1 block">Tipo *</label>
                <select
                  value={formData.plan_type}
                  onChange={(e) => setFormData({ ...formData, plan_type: e.target.value as 'private' | 'sus' })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                >
                  <option value="private">Plano de Saúde</option>
                  <option value="sus">SUS</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Nome do Plano *</label>
                <input
                  type="text"
                  value={formData.plan_name}
                  onChange={(e) => setFormData({ ...formData, plan_name: e.target.value })}
                  placeholder={formData.plan_type === 'sus' ? 'SUS' : 'Ex: Amil, Bradesco Saúde...'}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </div>

              {formData.plan_type === 'private' && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Operadora</label>
                  <input
                    type="text"
                    value={formData.operator_name}
                    onChange={(e) => setFormData({ ...formData, operator_name: e.target.value })}
                    placeholder="Nome da operadora"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  />
                </div>
              )}

              <div>
                <label className="text-sm font-medium mb-1 block">Número da Carteirinha *</label>
                <input
                  type="text"
                  value={formData.card_number}
                  onChange={(e) => setFormData({ ...formData, card_number: e.target.value })}
                  placeholder="Número impresso na carteirinha"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background font-mono"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Nome do Titular *</label>
                <input
                  type="text"
                  value={formData.beneficiary_name}
                  onChange={(e) => setFormData({ ...formData, beneficiary_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Validade</label>
                <input
                  type="text"
                  value={formData.validity}
                  onChange={(e) => setFormData({ ...formData, validity: e.target.value })}
                  placeholder="MM/AA"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </div>

              <button
                onClick={handleAddPlan}
                className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
              >
                Salvar Carteirinha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}