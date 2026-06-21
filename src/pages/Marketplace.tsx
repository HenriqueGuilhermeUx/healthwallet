import { useEffect, useState } from 'react'
import {
  ShoppingBag,
  Pill,
  FlaskConical,
  Plus,
  Clock,
  CheckCircle,
  Loader2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

export default function Marketplace() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<any[]>([])
  const [mode, setMode] = useState<'medication' | 'exam' | null>(null)

  const [form, setForm] = useState({
    title: '',
    description: '',
    total_amount: '',
  })

  useEffect(() => {
    loadOrders()
  }, [user])

  async function loadOrders() {
    if (!user) return

    setLoading(true)

    const { data } = await supabase
      .from('marketplace_orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setOrders(data || [])
    setLoading(false)
  }

  async function createOrder(type: 'medication' | 'exam') {
    if (!user) return

    const title =
      form.title ||
      (type === 'medication'
        ? 'Pedido de medicamento'
        : 'Agendamento de exame')

    const defaultAmount = type === 'medication' ? 79.9 : 129.9

    const { error } = await supabase.from('marketplace_orders').insert({
      user_id: user.id,
      type,
      status: 'pending_payment',
      provider: 'mock',
      title,
      description: form.description || '',
      items: [
        {
          name: title,
          quantity: 1,
        },
      ],
      offer_data: {
        source: 'HealthWallet MVP',
        provider_label: type === 'medication' ? 'Farmácia parceira' : 'Laboratório parceiro',
        estimated_delivery: type === 'medication' ? 'Entrega em até 2h' : 'Horários disponíveis sob confirmação',
      },
      payment_data: {
        method: 'pix_mock',
        status: 'pending',
      },
      total_amount: form.total_amount ? Number(form.total_amount) : defaultAmount,
    })

    if (error) {
      alert('Erro ao criar pedido')
      return
    }

    setMode(null)
    setForm({
      title: '',
      description: '',
      total_amount: '',
    })

    loadOrders()
  }

  async function markAsPaid(orderId: string) {
    await supabase
      .from('marketplace_orders')
      .update({
        status: 'paid',
        payment_data: {
          method: 'pix_mock',
          status: 'paid',
          paid_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    loadOrders()
  }

  async function cancelOrder(orderId: string) {
    if (!confirm('Deseja cancelar este pedido?')) return

    await supabase
      .from('marketplace_orders')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    loadOrders()
  }

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-emerald-700 to-cyan-800 text-white p-5">
        <div className="flex items-center gap-3">
          <ShoppingBag className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Medicamentos e Exames</h1>
            <p className="text-white/80 text-sm">
              Compre medicamentos e agende exames pelo HealthWallet.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setMode('medication')}
          className="bg-orange-600 text-white rounded-xl p-4 font-semibold flex flex-col items-center gap-2"
        >
          <Pill className="w-6 h-6" />
          Comprar remédio
        </button>

        <button
          onClick={() => setMode('exam')}
          className="bg-blue-600 text-white rounded-xl p-4 font-semibold flex flex-col items-center gap-2"
        >
          <FlaskConical className="w-6 h-6" />
          Agendar exame
        </button>
      </div>

      {mode && (
        <section className="bg-white rounded-xl border p-4 space-y-4">
          <h2 className="font-bold">
            {mode === 'medication' ? 'Novo pedido de medicamento' : 'Novo agendamento de exame'}
          </h2>

          <div>
            <label className="text-sm font-medium block mb-1">
              {mode === 'medication' ? 'Medicamento' : 'Exame'}
            </label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={mode === 'medication' ? 'Ex: Losartana 50mg' : 'Ex: Perfil lipídico'}
              className="w-full px-3 py-2 rounded-lg border bg-background"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Observação</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={
                mode === 'medication'
                  ? 'Ex: preciso de entrega em Santos'
                  : 'Ex: preferência pela manhã'
              }
              className="w-full px-3 py-2 rounded-lg border bg-background min-h-[90px]"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Valor estimado</label>
            <input
              type="number"
              value={form.total_amount}
              onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
              placeholder={mode === 'medication' ? '79.90' : '129.90'}
              className="w-full px-3 py-2 rounded-lg border bg-background"
            />
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800">
            MVP inicial: este pedido simula o fluxo. Depois conectamos Efí Pix,
            ePharma e Dasa.
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setMode(null)}
              className="flex-1 py-3 rounded-xl border font-medium"
            >
              Cancelar
            </button>

            <button
              onClick={() => createOrder(mode)}
              className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold"
            >
              Criar pedido
            </button>
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-bold mb-3">Meus pedidos</h2>

        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
          </div>
        ) : orders.length > 0 ? (
          <div className="space-y-3">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onPaid={() => markAsPaid(order.id)}
                onCancel={() => cancelOrder(order.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum pedido criado ainda.
          </p>
        )}
      </section>
    </div>
  )
}

function OrderCard({ order, onPaid, onCancel }: any) {
  const isMedication = order.type === 'medication'

  return (
    <div className="border rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          isMedication ? 'bg-orange-100' : 'bg-blue-100'
        }`}>
          {isMedication ? (
            <Pill className="w-5 h-5 text-orange-600" />
          ) : (
            <FlaskConical className="w-5 h-5 text-blue-600" />
          )}
        </div>

        <div className="flex-1">
          <p className="font-semibold">{order.title}</p>

          <p className="text-xs text-muted-foreground">
            {isMedication ? 'Medicamento' : 'Exame'} · {translateStatus(order.status)}
          </p>

          {order.description && (
            <p className="text-sm text-gray-600 mt-1">
              {order.description}
            </p>
          )}

          <p className="text-sm font-bold mt-2">
            R$ {Number(order.total_amount || 0).toFixed(2)}
          </p>

          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <Clock className="w-3 h-3" />
            {new Date(order.created_at).toLocaleDateString('pt-BR')}
          </div>

          {order.status === 'pending_payment' && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                onClick={onPaid}
                className="py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium"
              >
                Simular Pix pago
              </button>

              <button
                onClick={onCancel}
                className="py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium"
              >
                Cancelar
              </button>
            </div>
          )}

          {order.status === 'paid' && (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle className="w-4 h-4" />
              Pagamento confirmado. Próxima etapa: integração real.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function translateStatus(status: string) {
  const map: Record<string, string> = {
    draft: 'Rascunho',
    pending_payment: 'Aguardando Pix',
    paid: 'Pago',
    confirmed: 'Confirmado',
    cancelled: 'Cancelado',
    failed: 'Falhou',
  }

  return map[status] || status
}
