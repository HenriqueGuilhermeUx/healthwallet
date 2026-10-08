import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Circle,
  FileSignature,
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
  const [authorization, setAuthorization] = useState<any>(null)
  const [whatsapp, setWhatsapp] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [signUrl, setSignUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    void load()
  }, [user?.id])

  async function load(showToast = false) {
    if (!user) return
    setLoading(true)
    try {
      const [member, readinessRes, authRes, whatsappRes] = await Promise.all([
        getConciergeMembershipForPatient(user.id),
        supabase
          .from('concierge_subscriber_readiness')
          .select('*')
          .eq('patient_id', user.id)
          .maybeSingle(),
        supabase
          .from('concierge_legal_authorizations')
          .select('*')
          .eq('patient_id', user.id)
          .eq('authorization_type', 'combined_onboarding')
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
      setAuthorization(authRes.data || null)
      setWhatsapp(whatsappRes.data || null)
      if (showToast) toast.success('Status atualizado.')
    } catch (error) {
      console.warn('Concierge activation unavailable:', error)
    } finally {
      setLoading(false)
    }
  }

  async function legalAction(action: 'create' | 'sync') {
    setBusy(true)
    try {
      const { data: authData } = await supabase.auth.getSession()
      const token = authData.session?.access_token
      if (!token) throw new Error('Sua sessão expirou. Entre novamente.')

      const response = await fetch('/.netlify/functions/concierge-legal-onboarding', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      })
      const result = await response.json()
      if (!response.ok) {
        if (result?.error === 'concierge_consent_required') {
          throw new Error('Aceite primeiro o consentimento do Concierge.')
        }
        if (result?.error === 'docwallet_not_configured') {
          throw new Error('A assinatura DocWallet ainda não foi ativada neste ambiente.')
        }
        throw new Error('Não foi possível atualizar sua autorização.')
      }

      if (result.signUrl) {
        setSignUrl(result.signUrl)
        window.open(result.signUrl, '_blank', 'noopener,noreferrer')
      }

      await load()
      if (result.signed) toast.success('Autorização concluída.')
      else if (action === 'sync') toast.message('A assinatura ainda está pendente.')
      else toast.success('Documento criado. Conclua a assinatura no DocWallet.')
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível concluir esta etapa.')
    } finally {
      setBusy(false)
    }
  }

  const planActive = useMemo(() => {
    if (readiness) return ['active','trial','grace'].includes(readiness.entitlement_status)
    return !!membership && ['pilot','active'].includes(membership.status)
  }, [readiness, membership])

  const consentReady = membership?.consent_status === 'accepted'
  const legalReady = readiness?.privacy_ready && readiness?.representation_ready
    || authorization?.status === 'signed'
  const whatsappReady = Boolean(readiness?.whatsapp_ready || whatsapp)

  const readyForOperations = planActive && consentReady && legalReady

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
        <h1 className="mt-2 text-2xl font-bold">Deixe o Concierge pronto para agir por você.</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/75">Você pode conversar com o Concierge Digital assim que o plano e o consentimento estiverem ativos. Para a equipe falar com operadoras e conduzir processos administrativos em seu nome, precisamos também da autorização assinada.</p>
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
          icon={FileSignature}
          title="Termo + privacidade + representação administrativa"
          description={legalReady
            ? 'Documento assinado com identidade verificada.'
            : authorization?.status === 'signature_pending'
              ? 'Documento criado. Falta concluir a assinatura no DocWallet.'
              : 'Uma assinatura eletrônica com OTP libera a equipe para atuar administrativamente em seu nome.'}
          ready={legalReady}
        >
          {planActive && consentReady && !legalReady && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void legalAction(authorization?.docwallet_signature_request_id ? 'sync' : 'create')}
                className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? 'Verificando...' : authorization?.docwallet_signature_request_id ? 'Já assinei · verificar' : 'Gerar e assinar'}
              </button>
              {signUrl && (
                <button type="button" onClick={() => window.open(signUrl, '_blank', 'noopener,noreferrer')} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
                  Abrir DocWallet
                </button>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">A autorização não inclui senha pessoal, movimentação financeira, decisão médica nem representação judicial.</p>
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
            <p className="font-bold">{readyForOperations ? 'Seu Concierge está pronto para operar.' : 'Conclua as etapas acima para liberar atuação completa.'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{readyForOperations
              ? 'Converse normalmente. Quando houver algo concreto para resolver, o Concierge transforma a conversa em acompanhamento e a equipe entra quando necessário.'
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
