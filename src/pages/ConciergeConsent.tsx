import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Eye, History, Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import {
  acceptConciergeConsent,
  DEFAULT_CONCIERGE_SCOPE,
  getConciergeMembershipForPatient,
  listConciergeConsentEvents,
  listConciergeContextAccessLogs,
  revokeConciergeConsent,
  type ConciergeConsentScope,
} from '@/services/conciergeConsent'

const scopeOptions: Array<{ key: keyof ConciergeConsentScope; title: string; description: string }> = [
  { key: 'summary', title: 'Resumo de saúde', description: 'Informações essenciais para a equipe entender seu contexto.' },
  { key: 'exams', title: 'Exames e documentos clínicos', description: 'Resultados e documentos que você mantém na HealthWallet.' },
  { key: 'medications', title: 'Medicamentos', description: 'Medicamentos ativos para conciliação e acompanhamento.' },
  { key: 'timeline', title: 'Histórico e linha do tempo', description: 'Eventos relevantes da sua jornada de saúde.' },
  { key: 'passport', title: 'Medical Passport', description: 'Contexto resumido que você já organiza para atendimento.' },
  { key: 'medscore', title: 'MedScore', description: 'Score, fatores e evolução como apoio à coordenação — não diagnóstico.' },
  { key: 'device_data', title: 'Dispositivos conectados', description: 'Quais fontes de dados estão conectadas à sua HealthWallet.' },
  { key: 'daily_summaries', title: 'Tendências de dispositivos', description: 'Resumos longitudinais autorizados, como atividade, sono e sinais compatíveis.' },
  { key: 'documents', title: 'Documentos recebidos', description: 'Documentos que chegaram à sua HealthWallet e podem apoiar um caso.' },
  { key: 'family', title: 'Contexto familiar', description: 'Somente quando você também estiver coordenando um familiar autorizado.' },
]

const roleLabels: Record<string, string> = {
  nurse: 'Enfermagem',
  doctor: 'Médico',
  care_coordinator: 'Coordenação',
  admin: 'Administração assistencial',
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function ConciergeConsent() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [membership, setMembership] = useState<any>(null)
  const [scope, setScope] = useState<ConciergeConsentScope>({ ...DEFAULT_CONCIERGE_SCOPE })
  const [consentEvents, setConsentEvents] = useState<any[]>([])
  const [accessLogs, setAccessLogs] = useState<any[]>([])

  useEffect(() => {
    if (!user) return
    void load()
  }, [user?.id])

  async function load() {
    if (!user) return
    setLoading(true)
    try {
      const data = await getConciergeMembershipForPatient(user.id)
      setMembership(data)
      if (data?.consent_scope) setScope({ ...DEFAULT_CONCIERGE_SCOPE, ...data.consent_scope })

      if (data) {
        const [eventsResult, accessResult] = await Promise.allSettled([
          listConciergeConsentEvents(user.id),
          listConciergeContextAccessLogs(),
        ])
        setConsentEvents(eventsResult.status === 'fulfilled' ? eventsResult.value : [])
        setAccessLogs(accessResult.status === 'fulfilled' ? accessResult.value : [])
      }
    } catch (error) {
      console.warn('Concierge consent unavailable:', error)
    } finally {
      setLoading(false)
    }
  }

  const selectedCount = useMemo(() => Object.values(scope).filter(Boolean).length, [scope])

  async function accept() {
    setSaving(true)
    try {
      await acceptConciergeConsent(scope)
      toast.success('Preferências de acesso do Concierge salvas')
      await load()
      navigate('/concierge', { replace: true })
    } catch (error: any) {
      console.error('Concierge consent failed:', error)
      toast.error(error?.message || 'Não foi possível salvar seu consentimento.')
    } finally {
      setSaving(false)
    }
  }

  async function revoke() {
    if (!confirm('Revogar o acesso do HealthWallet Concierge? A equipe deixará de acessar seu contexto e o acompanhamento ficará pausado.')) return
    setSaving(true)
    try {
      await revokeConciergeConsent()
      toast.success('Acesso do Concierge revogado')
      await load()
    } catch (error: any) {
      console.error('Concierge revoke failed:', error)
      toast.error(error?.message || 'Não foi possível revogar agora.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>

  if (!membership) {
    return (
      <div className="space-y-5 pb-28">
        <button type="button" onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</button>
        <section className="rounded-3xl border bg-white p-6 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-emerald-700" />
          <h1 className="mt-3 text-xl font-bold">Concierge em piloto controlado</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sua conta ainda não foi incluída no piloto. Nenhum acesso adicional aos seus dados foi concedido.</p>
        </section>
      </div>
    )
  }

  const accepted = membership.consent_status === 'accepted'

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-teal-950 to-emerald-800 p-5 text-white">
        <button type="button" onClick={() => navigate(accepted ? '/concierge' : '/dashboard')} className="mb-4 flex items-center gap-2 text-sm text-white/70"><ArrowLeft className="h-4 w-4" /> Voltar</button>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/60"><ShieldCheck className="h-4 w-4" /> Controle do paciente</div>
        <h1 className="mt-2 text-2xl font-bold">Autorizar HealthWallet Concierge</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/80">Você escolhe quais partes da sua HealthWallet podem ser usadas pela sua equipe de referência para coordenar seu cuidado.</p>
      </section>

      <section className={`rounded-2xl border p-4 text-sm ${accepted ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : membership.consent_status === 'revoked' ? 'border-red-200 bg-red-50 text-red-950' : 'border-blue-200 bg-blue-50 text-blue-950'}`}>
        <p className="font-bold">Status: {accepted ? 'autorizado' : membership.consent_status === 'revoked' ? 'revogado' : 'aguardando sua autorização'}</p>
        <p className="mt-1 leading-relaxed">Entrar no piloto não libera seus dados automaticamente. O acesso profissional depende desta autorização, fica limitado ao Concierge e pode ser revogado por você.</p>
      </section>

      <section className="space-y-3">
        {scopeOptions.map((item) => {
          const checked = Boolean(scope[item.key])
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setScope((current) => ({ ...current, [item.key]: !current[item.key] }))}
              className={`w-full rounded-2xl border p-4 text-left transition ${checked ? 'border-emerald-300 bg-emerald-50/60' : 'bg-white'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 h-6 w-6 flex-shrink-0 rounded-lg border flex items-center justify-center ${checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>
                  {checked && <Check className="h-4 w-4" />}
                </div>
                <div><p className="font-semibold text-gray-900">{item.title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p></div>
              </div>
            </button>
          )
        })}
      </section>

      <section className="rounded-2xl border bg-white p-4 text-sm text-slate-700">
        <p><strong>{selectedCount}</strong> de {scopeOptions.length} categorias selecionadas.</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Sua equipe usa essas informações para contexto, acompanhamento e próximos passos. O Concierge não transforma dados de wearable ou MedScore em diagnóstico automático e não substitui atendimento de urgência.</p>
      </section>

      <button disabled={saving} onClick={accept} className="w-full rounded-2xl bg-emerald-700 px-4 py-4 font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2">
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
        {accepted ? 'Salvar minhas preferências' : 'Autorizar e ativar Concierge'}
      </button>

      {accepted && (
        <button disabled={saving} onClick={revoke} className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 disabled:opacity-50 flex items-center justify-center gap-2">
          <ShieldOff className="h-4 w-4" /> Revogar acesso e pausar acompanhamento
        </button>
      )}

      {accepted && (
        <section className="rounded-2xl border bg-white p-4">
          <div className="flex items-center gap-2"><Eye className="h-5 w-5 text-blue-700" /><h2 className="font-bold">Quem acessou meu contexto</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">O acesso ao contexto autorizado de um caso é registrado.</p>
          <div className="mt-3 space-y-2">
            {accessLogs.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-muted-foreground">Nenhum acesso profissional registrado ainda.</p> : accessLogs.map((item) => (
              <div key={item.access_id} className="rounded-xl bg-blue-50 p-3 text-sm">
                <p className="font-semibold text-blue-950">{item.professional_name}</p>
                <p className="mt-1 text-xs text-blue-900/70">{roleLabels[item.professional_role] || item.professional_role} · {formatDate(item.accessed_at)}</p>
                {item.request_id && <p className="mt-1 text-[11px] text-blue-900/55">Caso {String(item.request_id).slice(0, 8)}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-2"><History className="h-5 w-5 text-slate-700" /><h2 className="font-bold">Histórico de autorização</h2></div>
        <div className="mt-3 space-y-2">
          {consentEvents.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum evento de consentimento registrado ainda.</p> : consentEvents.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm"><div><p className="font-semibold">{item.event_type === 'accepted' ? 'Acesso autorizado' : 'Acesso revogado'}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(item.created_at)}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.event_type === 'accepted' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{item.event_type}</span></div>
          ))}
        </div>
      </section>
    </div>
  )
}
