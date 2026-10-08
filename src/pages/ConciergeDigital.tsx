import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Bot, Headphones, Loader2, Mic, MicOff, Send, Sparkles, UserRound, Volume2, VolumeX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { getConciergeMembershipForPatient } from '@/services/conciergeConsent'

type ChatMessage = {
  id: string
  actor_role: string
  source: string
  content: string
  created_at: string
}

const statusText: Record<string, string> = {
  ai_active: 'Concierge Digital atendendo',
  attention: 'Equipe acompanhando',
  human_requested: 'Aguardando atendimento humano',
  human_active: 'Concierge humano na conversa',
  closed: 'Conversa encerrada',
}

export default function ConciergeDigital() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [membership, setMembership] = useState<any>(null)
  const [entitlement, setEntitlement] = useState<any>(null)
  const [session, setSession] = useState<any>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceReplies, setVoiceReplies] = useState(true)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [familyMembers, setFamilyMembers] = useState<any[]>([])
  const [subjectFamilyMemberId, setSubjectFamilyMemberId] = useState<string>('')
  const [operationalCases, setOperationalCases] = useState<any[]>([])
  const [whatsappIdentity, setWhatsappIdentity] = useState<any>(null)
  const [whatsappLinkCode, setWhatsappLinkCode] = useState('')
  const [whatsappLinkExpiresAt, setWhatsappLinkExpiresAt] = useState<string | null>(null)
  const [whatsappLinking, setWhatsappLinking] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)

  const entitlementAllowed = entitlement
    ? ['trial','active','grace'].includes(entitlement.status)
    : Boolean(membership && ['pilot','active'].includes(membership.status))

  const hasDigitalAccess = !!membership
    && entitlementAllowed
    && membership.consent_status === 'accepted'
    && String(membership.plan_code || entitlement?.plan_code || '').startsWith('concierge')

  useEffect(() => {
    const w = window as any

    if (Capacitor.isNativePlatform()) {
      void SpeechRecognition.available()
        .then((result: any) => setVoiceSupported(Boolean(result?.available ?? result)))
        .catch(() => setVoiceSupported(false))
    } else {
      setVoiceSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition))
    }

    return () => {
      try { recognitionRef.current?.stop?.() } catch {}
      window.speechSynthesis?.cancel()
    }
  }, [])

  useEffect(() => {
    if (!user) return
    void bootstrap()
  }, [user?.id])

  useEffect(() => {
    if (!session?.id || !user) return

    const channel = supabase
      .channel(`concierge-patient-${session.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'concierge_chat_sessions',
        filter: `id=eq.${session.id}`,
      }, () => void refreshConversation(session.id))
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'concierge_chat_messages',
        filter: `session_id=eq.${session.id}`,
      }, () => void refreshConversation(session.id))
      .subscribe()

    const timer = window.setInterval(() => void refreshConversation(session.id), 15000)

    return () => {
      window.clearInterval(timer)
      void supabase.removeChannel(channel)
    }
  }, [session?.id, user?.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages.length])

  async function bootstrap() {
    if (!user) return
    setLoading(true)
    try {
      const [member, entitlementRes, familyRes, casesRes, whatsappRes] = await Promise.all([
        getConciergeMembershipForPatient(user.id),
        supabase
          .from('concierge_entitlements')
          .select('status,plan_code,current_period_end,grace_until')
          .eq('patient_id', user.id)
          .maybeSingle(),
        supabase
          .from('family_members')
          .select('id,name,relationship,member_type,is_elderly,health_plan')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('concierge_operational_cases')
          .select('id,case_type,title,status,insurer_name,protocol_number,regulatory_deadline_at,deadline_confirmed,next_followup_at,amount_requested,amount_reimbursed,updated_at')
          .eq('patient_id', user.id)
          .not('status', 'in', '(closed,cancelled)')
          .order('updated_at', { ascending: false })
          .limit(12),
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
      setEntitlement(entitlementRes.data || null)
      setFamilyMembers(familyRes.data || [])
      setOperationalCases(casesRes.data || [])
      setWhatsappIdentity(whatsappRes.data || null)

      const entitlementAllowed = entitlementRes.data
        ? ['trial','active','grace'].includes(entitlementRes.data.status)
        : Boolean(member && ['pilot','active'].includes(member.status))

      if (
        member
        && entitlementAllowed
        && member.consent_status === 'accepted'
        && String(member.plan_code || entitlementRes.data?.plan_code || '').startsWith('concierge')
      ) {
        const { data } = await supabase
          .from('concierge_chat_sessions')
          .select('*')
          .eq('patient_id', user.id)
          .neq('status', 'closed')
          .order('last_activity_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (data) {
          setSession(data)
          setSubjectFamilyMemberId(data.metadata?.subject_family_member_id || '')
          await refreshConversation(data.id)
        }
      }
    } catch (error) {
      console.warn('Concierge Digital bootstrap failed:', error)
    } finally {
      setLoading(false)
    }
  }

  async function createWhatsAppLinkCode() {
    setWhatsappLinking(true)
    try {
      const { data, error } = await supabase.rpc('concierge_create_whatsapp_link_challenge')
      if (error) throw error

      const code = String(data?.code || '')
      setWhatsappLinkCode(code)
      setWhatsappLinkExpiresAt(data?.expires_at || null)

      const number = String(import.meta.env.VITE_CONCIERGE_WHATSAPP_NUMBER || '').replace(/\D/g, '')
      if (number && code) {
        const text = encodeURIComponent(`VINCULAR ${code}`)
        window.open(`https://wa.me/${number}?text=${text}`, '_blank', 'noopener,noreferrer')
      } else {
        toast.success('Código criado. Envie VINCULAR + o código para o WhatsApp oficial do Concierge.')
      }
    } catch (error) {
      console.error('WhatsApp link challenge failed:', error)
      toast.error('Não foi possível iniciar a vinculação do WhatsApp.')
    } finally {
      setWhatsappLinking(false)
    }
  }

  async function refreshOperationalCases() {
    if (!user) return
    const { data } = await supabase
      .from('concierge_operational_cases')
      .select('id,case_type,title,status,insurer_name,protocol_number,regulatory_deadline_at,deadline_confirmed,next_followup_at,amount_requested,amount_reimbursed,updated_at')
      .eq('patient_id', user.id)
      .not('status', 'in', '(closed,cancelled)')
      .order('updated_at', { ascending: false })
      .limit(12)
    setOperationalCases(data || [])
  }

  async function refreshConversation(sessionId: string) {
    const [{ data: current }, { data: messageRows }] = await Promise.all([
      supabase.from('concierge_chat_sessions').select('*').eq('id', sessionId).maybeSingle(),
      supabase
        .from('concierge_chat_messages')
        .select('id,actor_role,source,content,created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(100),
    ])

    if (current) setSession(current)
    setMessages(messageRows || [])
  }

  async function sendMessage(messageValue?: string, source: 'text' | 'voice' = 'text') {
    const body = String(messageValue ?? input).trim()
    if (!body || sending || !user) return

    setSending(true)
    if (!messageValue) setInput('')

    try {
      const { data: authData } = await supabase.auth.getSession()
      const token = authData.session?.access_token
      if (!token) throw new Error('Sessão expirada. Entre novamente.')

      const res = await fetch('/.netlify/functions/concierge-digital-ai', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: session?.id || null,
          message: body,
          source,
          subjectFamilyMemberId: subjectFamilyMemberId || null,
        }),
      })

      const result = await res.json()
      if (!res.ok) {
        if (result?.error === 'concierge_subscription_required') {
          throw new Error('O Concierge Digital exige uma assinatura ativa.')
        }

        const isPreview = window.location.hostname.startsWith('deploy-preview-')
        const stage = result?.diagnostic?.stage ? String(result.diagnostic.stage) : null
        const code = result?.diagnostic?.code ? String(result.diagnostic.code) : null
        const suffix = isPreview && (stage || code)
          ? ` [${stage || 'runtime'}${code ? `:${code}` : ''}]`
          : ''

        throw new Error(`Não foi possível falar com o Concierge agora.${suffix}`)
      }

      const nextSessionId = result.sessionId || session?.id
      if (nextSessionId) {
        if (!session?.id) {
          const { data: created } = await supabase
            .from('concierge_chat_sessions')
            .select('*')
            .eq('id', nextSessionId)
            .maybeSingle()
          if (created) setSession(created)
        }

        await refreshConversation(nextSessionId)
        if (result.createdOperationalCase) await refreshOperationalCases()
      }

      if (result.reply && voiceReplies && source === 'voice') {
        speak(result.reply)
      }

      if (window.location.hostname.startsWith('deploy-preview-') && result.aiMode === 'fallback') {
        const code = result?.diagnostic?.code ? ` (${result.diagnostic.code})` : ''
        toast.message(`Fallback operacional ativo${code}`)
      }

      if (result.urgent) toast.error('Procure atendimento de urgência imediatamente.')
      if (result.needsHuman) toast.success('Sua equipe Concierge foi avisada.')
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível enviar sua mensagem.')
      setInput(body)
    } finally {
      setSending(false)
    }
  }

  async function requestHuman() {
    if (!session?.id) {
      await sendMessage('Quero falar com uma pessoa da equipe Concierge.', 'text')
      return
    }

    try {
      const { error } = await supabase.rpc('concierge_chat_request_human', {
        p_session_id: session.id,
      })
      if (error) throw error
      toast.success('Atendimento humano solicitado.')
      await refreshConversation(session.id)
    } catch {
      toast.error('Não foi possível chamar a equipe agora.')
    }
  }

  async function startVoice() {
    if (!voiceSupported || listening) return

    window.speechSynthesis?.cancel()

    if (Capacitor.isNativePlatform()) {
      setListening(true)
      try {
        const permission = await SpeechRecognition.checkPermissions()
        if ((permission as any)?.speechRecognition !== 'granted') {
          await SpeechRecognition.requestPermissions()
        }

        const result: any = await SpeechRecognition.start({
          language: 'pt-BR',
          maxResults: 1,
          prompt: 'Fale com o Concierge',
          partialResults: false,
          popup: true,
        })

        const transcript = String(result?.matches?.[0] || '').trim()
        if (transcript) await sendMessage(transcript, 'voice')
      } catch (error) {
        console.warn('Native speech recognition failed:', error)
        toast.error('Não consegui ouvir. Tente novamente.')
      } finally {
        setListening(false)
      }
      return
    }

    const w = window as any
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Recognition) return

    const recognition = new Recognition()
    recognition.lang = 'pt-BR'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.continuous = false

    recognition.onstart = () => setListening(true)
    recognition.onend = () => setListening(false)
    recognition.onerror = () => {
      setListening(false)
      toast.error('Não consegui ouvir. Tente novamente.')
    }
    recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim()
      if (transcript) void sendMessage(transcript, 'voice')
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  async function stopVoice() {
    if (Capacitor.isNativePlatform()) {
      try { await SpeechRecognition.stop() } catch {}
      setListening(false)
      return
    }

    try { recognitionRef.current?.stop?.() } catch {}
    setListening(false)
  }

  function speak(text: string) {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'pt-BR'
    utterance.rate = 1
    window.speechSynthesis.speak(utterance)
  }

  const firstName = user?.user_metadata?.full_name?.split(' ')[0]
    || user?.user_metadata?.name?.split(' ')[0]
    || user?.email?.split('@')[0]
    || ''

  const humanMode = ['human_requested', 'human_active'].includes(session?.status)

  const visibleMessages = useMemo(
    () => messages.filter((item) => item.content?.trim()),
    [messages],
  )

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
  }

  if (!hasDigitalAccess) {
    return (
      <div className="space-y-5 pb-28">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> HealthWallet</Link>
        <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-teal-950 to-emerald-800 p-6 text-white">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/65"><Sparkles className="h-4 w-4" /> Upgrade HealthWallet</div>
          <h1 className="mt-3 text-3xl font-bold">Concierge Digital</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/80">Converse por texto ou voz, organize próximos passos e tenha uma equipe humana pronta para entrar quando necessário.</p>
        </section>
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-bold">Disponível para assinantes Concierge</h2>
          <p className="mt-2 text-sm text-muted-foreground">Sua HealthWallet continua funcionando normalmente. O Concierge é a camada premium de coordenação e acompanhamento.</p>
          <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">A contratação online será conectada ao lançamento comercial. Até lá, a ativação é feita pela equipe MyDataMed.</p>
          <Link to="/concierge/activate" className="mt-3 inline-flex rounded-xl border px-4 py-2.5 text-sm font-bold text-emerald-800">Ver status de ativação</Link>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-[15rem]">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-teal-950 to-emerald-800 p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link to="/concierge" className="inline-flex items-center gap-2 text-sm text-white/65"><ArrowLeft className="h-4 w-4" /> Concierge</Link>
            <div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-wider text-white/60"><Sparkles className="h-4 w-4" /> Concierge Digital</div>
            <h1 className="mt-2 text-2xl font-bold">Olá{firstName ? `, ${firstName}` : ''}. O que você precisa resolver hoje?</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              window.speechSynthesis?.cancel()
              setVoiceReplies((value) => !value)
            }}
            className="rounded-xl bg-white/10 p-2.5"
            title={voiceReplies ? 'Desativar respostas faladas' : 'Ativar respostas faladas'}
          >
            {voiceReplies ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
            {statusText[session?.status || 'ai_active'] || 'Concierge Digital'}
          </div>
          <Link to="/concierge/activate" className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white">
            Configurar meu Concierge
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-gray-900">WhatsApp do Concierge</p>
            <p className="mt-1 text-xs text-muted-foreground">Use o mesmo Concierge por texto, áudio, foto de pedido, nota ou documento.</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${whatsappIdentity ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            {whatsappIdentity ? 'CONECTADO' : 'OPCIONAL'}
          </span>
        </div>

        {whatsappIdentity ? (
          <p className="mt-3 text-sm text-emerald-800">Número vinculado com segurança. Suas conversas entram na mesma fila do MyDataMed Concierge.</p>
        ) : (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void createWhatsAppLinkCode()}
              disabled={whatsappLinking}
              className="w-full rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {whatsappLinking ? 'Gerando código...' : 'Conectar meu WhatsApp'}
            </button>
            {whatsappLinkCode && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xs text-gray-500">Envie esta mensagem para o WhatsApp oficial do Concierge:</p>
                <p className="mt-2 font-mono text-lg font-bold tracking-wider text-slate-900">VINCULAR {whatsappLinkCode}</p>
                {whatsappLinkExpiresAt && <p className="mt-1 text-[11px] text-gray-400">Código válido por cerca de 15 minutos.</p>}
              </div>
            )}
          </div>
        )}
      </section>

      {familyMembers.length > 0 && visibleMessages.length === 0 && (
        <section className="rounded-2xl border bg-white p-4">
          <p className="text-sm font-bold text-gray-900">Para quem é esta conversa?</p>
          <p className="mt-1 text-xs text-muted-foreground">Você pode cuidar da sua própria saúde ou coordenar alguém do seu Círculo de Cuidado.</p>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSubjectFamilyMemberId('')}
              className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold ${!subjectFamilyMemberId ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'bg-white text-gray-700'}`}
            >
              Eu
            </button>
            {familyMembers.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSubjectFamilyMemberId(item.id)}
                className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold ${subjectFamilyMemberId === item.id ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'bg-white text-gray-700'}`}
              >
                {item.name}{item.relationship ? ` · ${item.relationship}` : ''}
              </button>
            ))}
          </div>
        </section>
      )}

      {visibleMessages.length === 0 && (
        <section className="rounded-2xl border bg-white p-5">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Bot className="h-5 w-5" /></div>
            <div>
              <p className="font-bold">Pode falar comigo normalmente.</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Ex.: “Preciso marcar minha ressonância”, “o plano negou a autorização”, “quero organizar o reembolso da minha mãe” ou “quero falar com uma pessoa”.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  'Marcar exame ou consulta',
                  'O plano deu uma data muito longe. Qual é meu prazo?',
                  'O plano negou uma autorização. O que posso fazer?',
                  'Quero organizar um reembolso',
                  'Estão limitando minhas sessões de terapia',
                  'Como funciona uma NIP na ANS?',
                  'Cuidar de internação ou cirurgia',
                ].map((label) => (
                  <button key={label} type="button" onClick={() => setInput(label)} className="rounded-full border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {operationalCases.length > 0 && (
        <section className="rounded-2xl border bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-gray-900">O Concierge está cuidando</p>
              <p className="mt-1 text-xs text-muted-foreground">Acompanhe demandas que viraram ação operacional.</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{operationalCases.length} ativo{operationalCases.length === 1 ? '' : 's'}</span>
          </div>
          <div className="mt-3 space-y-2">
            {operationalCases.slice(0, 5).map((item: any) => (
              <div key={item.id} className="rounded-xl border bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-gray-900">{item.title}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-700">{{
                    new: 'Novo',
                    collecting_docs: 'Coletando documentos',
                    ready_to_contact: 'Pronto para contato',
                    contacting_operator: 'Falando com operadora',
                    waiting_operator: 'Aguardando operadora',
                    action_required_patient: 'Precisamos de você',
                    escalated_ans: 'Escalado para ANS',
                    waiting_ans: 'Aguardando ANS',
                    scheduled: 'Agendado',
                    authorized: 'Autorizado',
                    reimbursed: 'Reembolsado',
                    resolved: 'Resolvido',
                  }[item.status] || item.status}</span>
                </div>
                {item.insurer_name && <p className="mt-1 text-xs text-gray-600">{item.insurer_name}{item.protocol_number ? ` · protocolo ${item.protocol_number}` : ''}</p>}
                {item.regulatory_deadline_at && <p className="mt-2 text-xs font-semibold text-amber-700">Prazo acompanhado: {new Date(item.regulatory_deadline_at).toLocaleDateString('pt-BR')} {item.deadline_confirmed ? '✓' : '(estimado)'}</p>}
                {item.next_followup_at && <p className="mt-1 text-xs text-gray-500">Próxima cobrança: {new Date(item.next_followup_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        {visibleMessages.map((message) => {
          const mine = message.actor_role === 'patient'
          const human = ['concierge','nurse','doctor','care_coordinator','admin'].includes(message.actor_role)
          return (
            <div key={message.id} className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
              {!mine && (
                <div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${human ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {human ? <UserRound className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
              )}
              <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${mine ? 'bg-emerald-700 text-white rounded-br-md' : human ? 'border border-blue-200 bg-blue-50 text-blue-950 rounded-bl-md' : 'border bg-white text-gray-900 rounded-bl-md'}`}>
                {human && <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">Equipe Concierge</p>}
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          )
        })}
        {sending && (
          <div className="flex gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Bot className="h-4 w-4" /></div>
            <div className="rounded-2xl border bg-white px-4 py-3 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Organizando...</div>
          </div>
        )}
        <div ref={endRef} />
      </section>

      <button
        type="button"
        onClick={requestHuman}
        disabled={session?.status === 'human_requested' || session?.status === 'human_active'}
        className="w-full rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 disabled:opacity-60"
      >
        <span className="inline-flex items-center gap-2"><Headphones className="h-4 w-4" /> {session?.status === 'human_active' ? 'Equipe humana na conversa' : session?.status === 'human_requested' ? 'Aguardando equipe humana' : 'Falar com uma pessoa'}</span>
      </button>

      <div
        className="fixed left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t bg-background/95 p-3 backdrop-blur"
        style={{ bottom: 'calc(7.35rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {listening && <p className="mb-2 text-center text-xs font-semibold text-red-600">Ouvindo… fale normalmente</p>}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={listening ? stopVoice : startVoice}
            disabled={!voiceSupported || sending || humanMode && session?.status === 'human_requested'}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40 ${listening ? 'bg-red-600' : 'bg-slate-900'}`}
            title={voiceSupported ? 'Falar' : 'Voz indisponível neste navegador'}
          >
            {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={1}
            maxLength={5000}
            placeholder={humanMode ? 'Escreva para a equipe Concierge…' : 'Fale ou escreva o que precisa resolver…'}
            className="max-h-28 min-h-12 flex-1 resize-none rounded-2xl border bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void sendMessage()
              }
            }}
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!input.trim() || sending}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
        {!voiceSupported && <p className="mt-2 text-center text-[11px] text-muted-foreground">Texto disponível. Voz será habilitada automaticamente em navegador/app compatível.</p>}
      </div>
    </div>
  )
}
