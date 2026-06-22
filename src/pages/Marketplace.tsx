import { useEffect, useState } from 'react'
import {
  ShoppingBag,
  Pill,
  FlaskConical,
  Clock,
  CheckCircle,
  Loader2,
  MapPin,
  Truck,
  CalendarDays,
  CreditCard,
  XCircle,
  Sparkles,
  HeartPulse,
  MessageCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { calculateMedScore } from '@/services/calculateMedScore'

type MarketplaceType = 'medication' | 'exam'

const BASE_MEDICATION_OFFERS = [
  {
    title: 'Losartana 50mg',
    description: 'Medicamento comum para controle de pressão arterial.',
    price: 39.9,
    provider: 'Farmácia parceira',
    benefit: 'Entrega estimada em até 2h',
  },
  {
    title: 'Rosuvastatina 10mg',
    description: 'Medicamento usado para controle de colesterol.',
    price: 69.9,
    provider: 'Farmácia parceira',
    benefit: 'Desconto HealthWallet aplicado',
  },
  {
    title: 'Vitamina D 2000UI',
    description: 'Suplementação conforme orientação profissional.',
    price: 49.9,
    provider: 'Farmácia parceira',
    benefit: 'Retirada ou entrega disponível',
  },
]

const BASE_EXAM_OFFERS = [
  {
    title: 'Perfil Lipídico',
    description: 'Colesterol total, HDL, LDL e triglicerídeos.',
    price: 89.9,
    provider: 'Laboratório parceiro',
    benefit: 'Horários pela manhã',
  },
  {
    title: 'Hemoglobina Glicada HbA1c',
    description: 'Avaliação de risco metabólico e controle glicêmico.',
    price: 59.9,
    provider: 'Laboratório parceiro',
    benefit: 'Resultado digital',
  },
  {
    title: 'Check-up Cardiometabólico',
    description: 'Perfil lipídico, glicemia, HbA1c, PCR-us e ApoB.',
    price: 249.9,
    provider: 'Laboratório parceiro',
    benefit: 'Pacote recomendado pelo MedScore',
  },
]

export default function Marketplace() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<any[]>([])
  const [mode, setMode] = useState<MarketplaceType>('exam')
  const [customOpen, setCustomOpen] = useState(false)
  const [medScore, setMedScore] = useState<any>(null)
  const [recommendedExams, setRecommendedExams] = useState<any[]>([])
  const [activeMedications, setActiveMedications] = useState<any[]>([])

  const [form, setForm] = useState({
    title: '',
    description: '',
    total_amount: '',
  })

  useEffect(() => {
    load()
  }, [user])

  async function load() {
    if (!user) return

    setLoading(true)

    const [ordersRes, profileRes, recordsRes, conditionsRes, medsRes] =
      await Promise.all([
        supabase
          .from('marketplace_orders')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),

        supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle(),

        supabase
          .from('medical_records')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),

        supabase
          .from('patient_conditions')
          .select('*')
          .eq('user_id', user.id),

        supabase
          .from('medications')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
      ])

    const calculated = calculateMedScore(
      profileRes.data || {},
      recordsRes.data || [],
      conditionsRes.data || []
    )

    setOrders(ordersRes.data || [])
    setMedScore(calculated)
    setRecommendedExams(buildRecommendedByMedScore(calculated))
    setActiveMedications(medsRes.data || [])
    setLoading(false)
  }

  async function createOrderFromOffer(type: MarketplaceType, offer: any) {
    if (!user) return

    const { error } = await supabase.from('marketplace_orders').insert({
      user_id: user.id,
      type,
      status: 'pending_payment',
      provider: 'mock',
      title: offer.title,
      description: offer.description,
      items: [
        {
          name: offer.title,
          quantity: 1,
          price: offer.price,
          reason: offer.reason || null,
        },
      ],
      offer_data: {
        source: offer.source || 'HealthWallet Marketplace MVP',
        provider_label: offer.provider,
        estimated_delivery: offer.benefit,
        medscore_reason: offer.reason || null,
        integration_ready: type === 'medication' ? 'epharma' : 'dasa',
      },
      payment_data: {
        method: 'pix_mock',
        status: 'pending',
      },
      total_amount: offer.price,
    })

    if (error) {
      alert('Erro ao criar pedido')
      return
    }

    load()
  }

  async function createMedicationReorder(med: any) {
    const offer = {
      title: med.name || med.medication_name || 'Medicamento em uso',
      description: [med.dosage, med.frequency].filter(Boolean).join(' · ') || 'Medicamento cadastrado no HealthWallet.',
      price: 79.9,
      provider: 'Farmácia parceira',
      benefit: 'Recompra baseada no seu tratamento ativo',
      source: 'HealthWallet Medicamentos',
      reason: 'Medicamento ativo cadastrado no seu perfil.',
    }

    await createOrderFromOffer('medication', offer)
  }

  async function createCustomOrder(type: MarketplaceType) {
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
      items: [{ name: title, quantity: 1 }],
      offer_data: {
        source: 'HealthWallet Marketplace MVP',
        provider_label: type === 'medication' ? 'Farmácia parceira' : 'Laboratório parceiro',
        estimated_delivery: type === 'medication' ? 'Entrega em até 2h' : 'Horários disponíveis sob confirmação',
        integration_ready: type === 'medication' ? 'epharma' : 'dasa',
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

    setCustomOpen(false)
    setForm({ title: '', description: '', total_amount: '' })
    load()
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

    load()
  }

  async function confirmOrder(orderId: string) {
    await supabase
      .from('marketplace_orders')
      .update({
        status: 'confirmed',
        external_refs: {
          mock_confirmation: `HW-${Math.floor(100000 + Math.random() * 900000)}`,
          confirmed_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    load()
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

    load()
  }

  const offers = mode === 'medication' ? BASE_MEDICATION_OFFERS : BASE_EXAM_OFFERS

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-emerald-700 to-cyan-800 text-white p-5">
        <div className="flex items-center gap-3">
          <ShoppingBag className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Medicamentos e Exames</h1>
            <p className="text-white/80 text-sm">
              Recomendações ligadas ao seu MedScore.
            </p>
          </div>
        </div>
      </div>

      {medScore && (
        <section className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-3">
            <HeartPulse className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold">Recomendado pelo seu MedScore</h2>
          </div>

          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 mb-3">
            <p className="text-sm text-emerald-800">
              Seu MedScore atual é <strong>{medScore.score}/100</strong>.
            </p>
            <p className="text-xs text-emerald-700 mt-1">
              Essas sugestões ajudam a melhorar a precisão do score e apoiar decisões preventivas.
            </p>
          </div>

          <div className="space-y-3">
            {recommendedExams.map((offer) => (
              <OfferCard
                key={offer.title}
                type="exam"
                offer={offer}
                onCreate={() => createOrderFromOffer('exam', offer)}
              />
            ))}
          </div>
        </section>
      )}

      {activeMedications.length > 0 && (
        <section className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Pill className="w-5 h-5 text-orange-600" />
            <h2 className="font-bold text-orange-900">Comprar novamente</h2>
          </div>

          <div className="space-y-3">
            {activeMedications.slice(0, 4).map((med) => (
              <div key={med.id} className="bg-white border border-orange-100 rounded-xl p-3">
                <p className="font-semibold text-sm">
                  {med.name || med.medication_name || 'Medicamento'}
                </p>
                <p className="text-xs text-gray-500">
                  {[med.dosage, med.frequency].filter(Boolean).join(' · ') || 'Medicamento em uso'}
                </p>

                <button
                  onClick={() => createMedicationReorder(med)}
                  className="mt-3 w-full py-2 rounded-lg bg-orange-600 text-white text-sm font-medium"
                >
                  Comprar novamente
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setMode('medication')}
          className={`rounded-xl p-4 font-semibold flex flex-col items-center gap-2 ${
            mode === 'medication'
              ? 'bg-orange-600 text-white'
              : 'bg-white border text-gray-700'
          }`}
        >
          <Pill className="w-6 h-6" />
          Medicamentos
        </button>

        <button
          onClick={() => setMode('exam')}
          className={`rounded-xl p-4 font-semibold flex flex-col items-center gap-2 ${
            mode === 'exam'
              ? 'bg-blue-600 text-white'
              : 'bg-white border text-gray-700'
          }`}
        >
          <FlaskConical className="w-6 h-6" />
          Exames
        </button>
      </div>

      <section className="bg-white rounded-xl border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          <h2 className="font-bold">
            {mode === 'medication' ? 'Ofertas de medicamentos' : 'Exames disponíveis'}
          </h2>
        </div>

        <div className="space-y-3">
          {offers.map((offer) => (
            <OfferCard
              key={offer.title}
              type={mode}
              offer={offer}
              onCreate={() => createOrderFromOffer(mode, offer)}
            />
          ))}
        </div>

        <button
          onClick={() => setCustomOpen(!customOpen)}
          className="mt-4 w-full py-3 rounded-xl border border-emerald-200 text-emerald-700 font-semibold"
        >
          {customOpen ? 'Fechar pedido personalizado' : 'Criar pedido personalizado'}
        </button>
      </section>

      {customOpen && (
        <section className="bg-white rounded-xl border p-4 space-y-4">
          <h2 className="font-bold">
            {mode === 'medication' ? 'Pedido personalizado' : 'Agendamento personalizado'}
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

          <button
            onClick={() => createCustomOrder(mode)}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold"
          >
            Criar pedido
          </button>
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
                onConfirm={() => confirmOrder(order.id)}
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

function buildRecommendedByMedScore(medScore: any) {
  const metrics = medScore.metrics || {}
  const missing = medScore.missingExams || []
  const recommendations: any[] = []

  if (!metrics.apoB) {
    recommendations.push({
      title: 'ApoB',
      description: 'Ajuda a refinar o risco cardiovascular além do LDL.',
      price: 89.9,
      provider: 'Laboratório parceiro',
      benefit: 'Recomendado para avaliação cardiovascular',
      reason: 'Seu MedScore pode ficar mais preciso com ApoB.',
      source: 'MedScore',
    })
  }

  if (!metrics.lpa && !metrics.lipoproteinaA) {
    recommendations.push({
      title: 'Lipoproteína(a) - Lp(a)',
      description: 'Exame importante para risco cardiovascular hereditário.',
      price: 119.9,
      provider: 'Laboratório parceiro',
      benefit: 'Útil para histórico familiar e prevenção',
      reason: 'Ajuda a avaliar risco cardiovascular familiar.',
      source: 'MedScore',
    })
  }

  if (!metrics.hba1c && missing.some((m: string) => m.toLowerCase().includes('glic'))) {
    recommendations.push({
      title: 'Hemoglobina Glicada HbA1c',
      description: 'Avalia controle glicêmico dos últimos meses.',
      price: 59.9,
      provider: 'Laboratório parceiro',
      benefit: 'Recomendado para risco metabólico',
      reason: 'Seu MedScore identificou dados metabólicos incompletos.',
      source: 'MedScore',
    })
  }

  if (!metrics.pcrUltrasensitive) {
    recommendations.push({
      title: 'PCR ultrassensível',
      description: 'Marcador inflamatório usado na avaliação cardiovascular.',
      price: 74.9,
      provider: 'Laboratório parceiro',
      benefit: 'Complementa avaliação cardiometabólica',
      reason: 'Pode ajudar a refinar sua área cardiovascular.',
      source: 'MedScore',
    })
  }

  if (!recommendations.length) {
    recommendations.push({
      title: 'Check-up Cardiometabólico',
      description: 'Pacote preventivo para manter o MedScore atualizado.',
      price: 249.9,
      provider: 'Laboratório parceiro',
      benefit: 'Pacote preventivo',
      reason: 'Seus dados principais estão bons; mantenha acompanhamento.',
      source: 'MedScore',
    })
  }

  return recommendations.slice(0, 4)
}

function OfferCard({ type, offer, onCreate }: any) {
  const isMedication = type === 'medication'

  return (
    <div className="border rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${
          isMedication ? 'bg-orange-100' : 'bg-blue-100'
        }`}>
          {isMedication ? (
            <Pill className="w-5 h-5 text-orange-600" />
          ) : (
            <FlaskConical className="w-5 h-5 text-blue-600" />
          )}
        </div>

        <div className="flex-1">
          <p className="font-semibold">{offer.title}</p>
          <p className="text-sm text-gray-600 mt-1">{offer.description}</p>

          {offer.reason && (
            <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded-lg p-2 text-xs text-emerald-800">
              {offer.reason}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
            {isMedication ? <Truck className="w-3 h-3" /> : <CalendarDays className="w-3 h-3" />}
            {offer.benefit}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            {offer.provider}
          </div>

          <div className="flex items-center justify-between mt-3">
            <p className="text-lg font-bold">
              R$ {Number(offer.price || 0).toFixed(2)}
            </p>

            <div className="flex gap-2">
              <Link
                to={`/chat?context=score&question=${encodeURIComponent(`Explique por que o exame ${offer.title} é recomendado para mim.`)}`}
                className="px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1"
              >
                <MessageCircle className="w-3 h-3" />
                Por quê?
              </Link>

              <button
                onClick={onCreate}
                className={`px-4 py-2 rounded-lg text-white text-sm font-medium ${
                  isMedication ? 'bg-orange-600' : 'bg-blue-600'
                }`}
              >
                {isMedication ? 'Comprar' : 'Agendar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function OrderCard({ order, onPaid, onConfirm, onCancel }: any) {
  const isMedication = order.type === 'medication'
  const inactive = ['cancelled', 'failed'].includes(order.status)

  return (
    <div className={`border rounded-xl p-4 ${inactive ? 'opacity-60' : ''}`}>
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

          {order.offer_data?.provider_label && (
            <p className="text-xs text-muted-foreground mt-2">
              {order.offer_data.provider_label} · {order.offer_data.estimated_delivery}
            </p>
          )}

          {order.offer_data?.medscore_reason && (
            <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded-lg p-2 text-xs text-emerald-800">
              {order.offer_data.medscore_reason}
            </div>
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
            <div className="grid grid-cols-1 gap-2 mt-3">
              <button
                onClick={onConfirm}
                className="py-2 rounded-lg bg-blue-600 text-white text-sm font-medium flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                Confirmar pedido
              </button>
            </div>
          )}

          {order.status === 'confirmed' && (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle className="w-4 h-4" />
              Pedido confirmado. Voucher/código será exibido na integração real.
            </div>
          )}

          {order.status === 'cancelled' && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-2 flex items-center gap-2 text-sm text-red-700">
              Pedido cancelado.
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
