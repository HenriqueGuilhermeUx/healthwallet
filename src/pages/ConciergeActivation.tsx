import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Circle,
  Loader2,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { getConciergeMembershipForPatient } from '@/services/conciergeConsent'

export default function ConciergeActivation() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [membership, setMembership] = useState<any>(null)
  const [readiness, setReadiness] = useState<any>(null)
  const [whatsapp, setWhatsapp] = useState<any>(null)

  useEffect(() => {
    if (!user) return
    void load()
  }, [user?.id])

  async function load(showToast = false) {
    if (!user) return
    setLoading(true)
    try {
      const [member, readinessRes, whatsappRes] = await Promise.all([
        getConciergeMembershipForPatient(user.id),
        supabase
          .from('concierge_subscriber_readiness')
          .select('*')
          .eq('patient_id', user.id)
          .maybeSingle(),
        supabase
          .from('concierge_channel_identities')
          .select('id,external_address,verified_at,active')
          .eq('patient_id', user.id)
          .eq('channel', 'whatsapp')
          .eq('active', true)
          .order('verified_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      setMembership(member)
      setReadiness(readinessRes.data || null)
      setWhatsapp(whatsappRes.data || null)
      if (showToast) toast.success('Status atualizado.')
    } catch (error) {
      console.warn('Concierge activation unavailable:', error)
    } finally {
      setLoading(false)
    }
  }

  const planActive = useMemo(() => {
    if (readiness) return ['active','trial','grace'].includes(readiness.entitlement_status)
    return !!membership && ['pilot','active'].includes(membership.status)
  }, [readiness, membership])

  const consentReady = membership?.consent_status === 'accepted'
  const whatsappReady = Boolean(readiness?.whatsapp_ready || whatsapp)

  const readyForOperations = planActive && consentReady

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
  }

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-teal-950 to-emerald-800 p-5 text-white">
        <button type="button" onClick={() => navigate('/concierge/digital')} className="mb-4 flex items-center gap-2 text-sm text-white/70">
          <ArrowLeft className="h-4 w-4" /> Concierge
        </button>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/60"><Sparkles className="h-4 w-4" /> Ativação Concierge</div>
        <h1 className="mt-2 text-2xl font-bold">Ative seu Concierge e comece a usar.</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/75">Plano ativo e consentimento aceito: pronto. Você já pode conversar com o Concierge Digital e pedir ajuda à equipe humana. Se algum caso exigir uma autorização ou documento assinado, pediremos isso somente naquele momento.</p>
      </section>

      <section className="space-y-3">
        <StepCard
          icon={BadgeCheck}
          title="Plano Concierge"
          description={planActive ? `Acesso ${readiness?.entitlement_status || membership?.status || 'ativo'}.` : 'O Concierge Digital é um upgrade da HealthWallet.'}
          ready={planActive}
        >
          {!planActive && <p className="text-xs text-muted-foreground">A contratação comercial será conectada ao checkout. Até lá, a ativação é feita pela equipe MyDataMed.</p>}
        </StepCard>

        <StepCard
          icon={ShieldCheck}
          title="Consentimento do Concierge"
          description={consentReady ? 'Consentimento registrado.' : 'Precisamos do seu aceite antes de usar seus dados no serviço Concierge.'}
          ready={consentReady}
        >
          {!consentReady && planActive && (
            <Link to="/concierge/consent" className="mt-3 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">
              Ler e aceitar
            </Link>
          )}
        </StepCard>

        <StepCard
          icon={ShieldCheck}
          title="Autorizações e documentos específicos"
          description="Não bloqueiam sua entrada no Concierge. Se um caso exigir assinatura, autorização formal ou envio de documento ao plano/ANS, o Concierge solicita isso dentro daquele caso."
          ready={false}
          optional
        >
          <p className="mt-3 text-xs text-muted-foreground">Quando necessário, usamos o DocWallet para registrar assinatura e evidências do documento específico. Nenhuma autorização ampla é exigida para começar a usar o Concierge.</p>
        </StepCard>

        <StepCard
          icon={Smartphone}
          title="WhatsApp"
          description={whatsappReady ? 'Número verificado e conectado.' : 'Opcional: use o mesmo Concierge por texto, áudio, fotos e documentos no WhatsApp.'}
          ready={whatsappReady}
          optional
        >
          {!whatsappReady && planActive && (
            <Link to="/concierge/digital" className="mt-3 inline-flex rounded-xl border px-4 py-2.5 text-sm font-bold text-emerald-800">
              Conectar no Concierge Digital
            </Link>
          )}
        </StepCard>
      </section>

      <section className={`rounded-2xl border p-5 ${readyForOperations ? 'border-emerald-200 bg-emerald-50' : 'bg-white'}`}>
        <div className="flex items-start gap-3">
          {readyForOperations
            ? <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-700" />
            : <Circle className="mt-0.5 h-6 w-6 text-slate-400" />}
          <div className="flex-1">
            <p className="font-bold">{readyForOperations ? 'Seu Concierge está ativo.' : 'Falta concluir plano e consentimento.'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{readyForOperations
              ? 'Converse normalmente. Quando houver algo concreto para resolver, o Concierge acompanha o caso e só pede assinatura ou autorização se aquela situação realmente exigir.'
              : 'Você continua com sua HealthWallet normalmente enquanto finaliza a ativação.'}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Link to="/concierge/digital" className="rounded-xl bg-emerald-700 px-4 py-3 text-center text-sm font-bold text-white">
            <MessageCircle className="mr-2 inline h-4 w-4" /> Abrir Concierge
          </Link>
          <button type="button" onClick={() => void load(true)} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold">
            <RefreshCw className="mr-2 inline h-4 w-4" /> Atualizar status
          </button>
        </div>
      </section>
    </div>
  )
}

function StepCard({
  icon: Icon,
  title,
  description,
  ready,
  optional = false,
  children,
}: {
  icon: any
  title: string
  description: string
  ready: boolean
  optional?: boolean
  children?: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border bg-white p-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ready ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-gray-900">{title}</p>
            {optional && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">OPCIONAL</span>}
            {ready && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">PRONTO</span>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          {children}
        </div>
      </div>
    </section>
  )
}
