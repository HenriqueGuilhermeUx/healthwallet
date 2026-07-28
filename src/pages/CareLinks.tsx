import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Stethoscope,
  XCircle,
} from 'lucide-react'

const scopeLabels: Record<string, string> = {
  summary: 'Resumo de saúde',
  exams: 'Exames e documentos',
  medications: 'Medicamentos',
  timeline: 'Linha do tempo',
  passport: 'Passport / emergência',
  medscore: 'MedScore',
  documents: 'Documentos recebidos',
  family: 'Família/dependentes',
}

function mergeById(items: any[]) {
  const map = new Map<string, any>()
  items.forEach((item) => {
    if (item?.id) map.set(item.id, item)
  })
  return Array.from(map.values()).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

export default function CareLinks() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [links, setLinks] = useState<any[]>([])
  const [systemNotice, setSystemNotice] = useState('')

  useEffect(() => {
    loadLinks()
  }, [user])

  async function loadLinks() {
    if (!user) return
    setLoading(true)
    setSystemNotice('')

    try {
      const email = user.email || ''
      const queries = [
        supabase
          .from('professional_care_links')
          .select('*')
          .eq('patient_id', user.id)
          .order('created_at', { ascending: false }),
      ]

      if (email) {
        queries.push(
          supabase
            .from('professional_care_links')
            .select('*')
            .ilike('patient_email', email)
            .order('created_at', { ascending: false })
        )
      }

      const results = await Promise.all(queries)
      const firstError = results.find((result) => result.error)?.error

      if (firstError) {
        console.warn('Care links unavailable:', firstError.message)
        setLinks([])
        setSystemNotice('Vínculos serão exibidos aqui quando houver uma solicitação de profissional para você aprovar.')
        return
      }

      setLinks(mergeById(results.flatMap((result) => result.data || [])))
    } catch (error) {
      console.warn('Care links loading skipped:', error)
      setLinks([])
      setSystemNotice('Vínculos serão exibidos aqui quando houver uma solicitação de profissional para você aprovar.')
    } finally {
      setLoading(false)
    }
  }

  async function emitAutomationEvent(eventType: string, item: any, extraPayload: any = {}) {
    if (!user) return

    try {
      await supabase.from('automation_events').insert({
        event_type: eventType,
        source_app: 'healthwallet',
        source_table: 'professional_care_links',
        source_id: item.id,
        actor_user_id: user.id,
        actor_role: 'patient',
        patient_id: user.id,
        professional_id: item.professional_id || null,
        care_link_id: item.id,
        payload: {
          patient_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
          patient_email: user.email,
          professional_name: item.professional_name,
          professional_email: item.professional_email,
          scope: item.scope || item.requested_scope || {},
          continuous: item.continuous,
          duration_days: item.duration_days,
          ...extraPayload,
        },
        metadata: {
          powered_by: 'MyDataMed Autopilot',
          n8n_ready: true,
        },
        priority: eventType === 'care_link_approved' ? 2 : 4,
        status: 'pending',
      })
    } catch {
      // Não bloqueia o consentimento se a fila Autopilot ainda não estiver ativa para o app.
    }
  }

  async function approve(item: any) {
    if (!user) return
    const scope = item.requested_scope && Object.keys(item.requested_scope).length ? item.requested_scope : item.scope
    const expiresAt = item.continuous ? null : new Date(Date.now() + Number(item.duration_days || 365) * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await supabase
      .from('professional_care_links')
      .update({
        status: 'active',
        patient_id: user.id,
        patient_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
        scope,
        approved_at: new Date().toISOString(),
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
        metadata: {
          ...(item.metadata || {}),
          approved_from: 'healthwallet',
        },
      })
      .eq('id', item.id)

    if (error) {
      toast.error('Não foi possível aprovar agora. Tente novamente em instantes.')
      return
    }

    await emitAutomationEvent('care_link_approved', { ...item, scope }, { expires_at: expiresAt })
    toast.success('Vínculo aprovado')
    loadLinks()
  }

  async function reject(item: any) {
    const { error } = await supabase
      .from('professional_care_links')
      .update({ status: 'rejected', rejected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', item.id)

    if (error) {
      toast.error('Não foi possível recusar agora. Tente novamente em instantes.')
      return
    }

    await emitAutomationEvent('care_link_rejected', item)
    toast.success('Solicitação recusada')
    loadLinks()
  }

  async function revoke(item: any) {
    if (!confirm('Revogar este vínculo assistencial? O profissional deixará de ter acesso contínuo.')) return

    const { error } = await supabase
      .from('professional_care_links')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', item.id)

    if (error) {
      toast.error('Não foi possível revogar agora. Tente novamente em instantes.')
      return
    }

    await emitAutomationEvent('care_link_revoked', item)
    toast.success('Vínculo revogado')
    loadLinks()
  }

  const stats = useMemo(() => ({
    active: links.filter((item) => item.status === 'active').length,
    pending: links.filter((item) => item.status === 'pending').length,
    total: links.length,
  }), [links])

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-800 p-5 text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-white/10" />
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-3">
            <ShieldCheck className="w-4 h-4" /> Vínculo assistencial autorizado
          </div>
          <h1 className="text-2xl font-bold">Meus profissionais</h1>
          <p className="text-white/85 text-sm mt-2">
            Aprove, acompanhe ou revogue profissionais que pediram acesso contínuo ao seu histórico de saúde.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Stat label="Ativos" value={stats.active} />
        <Stat label="Pendentes" value={stats.pending} />
        <Stat label="Total" value={stats.total} />
      </section>

      <section className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900 flex gap-2">
        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
        <p>
          Você controla o acesso. O profissional só vê os dados autorizados, pelo prazo aprovado, e você pode revogar a qualquer momento.
        </p>
      </section>

      {systemNotice && (
        <section className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700">
          {systemNotice}
        </section>
      )}

      <section className="space-y-3">
        {links.length === 0 && !systemNotice && (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma solicitação de vínculo assistencial ainda.
          </div>
        )}

        {links.map((item) => (
          <div key={item.id} className="rounded-2xl bg-white border border-border p-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold text-gray-900">{item.professional_name || 'Profissional de saúde'}</h2>
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-sm text-muted-foreground mt-1">{item.professional_email || 'E-mail não informado'}</p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {item.continuous ? 'Acesso contínuo até revogação' : `Prazo solicitado: ${item.duration_days || 365} dias`}
                </p>
              </div>
            </div>

            {item.request_note && <p className="text-sm text-gray-700 rounded-xl bg-gray-50 border p-3">{item.request_note}</p>}

            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Escopo solicitado</p>
              <div className="grid grid-cols-2 gap-2">
                {scopeItems(item.requested_scope || item.scope).map((label) => (
                  <div key={label} className="rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-900 px-3 py-2 text-xs flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> {label}
                  </div>
                ))}
              </div>
            </div>

            {item.status === 'pending' && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => reject(item)} className="rounded-xl border border-red-200 text-red-600 py-2 text-sm font-medium flex items-center justify-center gap-1">
                  <XCircle className="w-4 h-4" /> Recusar
                </button>
                <button onClick={() => approve(item)} className="rounded-xl bg-emerald-600 text-white py-2 text-sm font-medium flex items-center justify-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Aprovar
                </button>
              </div>
            )}

            {item.status === 'active' && (
              <button onClick={() => revoke(item)} className="w-full rounded-xl border border-red-200 text-red-600 py-2 text-sm font-medium flex items-center justify-center gap-1">
                <XCircle className="w-4 h-4" /> Revogar vínculo
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="rounded-xl bg-white border border-border p-4 space-y-2">
        <div className="flex items-center gap-2 font-bold text-gray-900"><FileText className="w-5 h-5 text-emerald-600" /> Como funciona</div>
        <p className="text-sm text-muted-foreground">O vínculo assistencial permite acompanhamento contínuo autorizado. Ele não substitui consentimentos específicos, receitas, laudos ou documentos que exijam assinatura própria.</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><MessageCircle className="w-4 h-4" /> SmartBots, Staff, DocWallet, NextGen e n8n podem apoiar agenda, lembretes, documentos, planos e automações.</div>
      </section>
    </div>
  )
}

function Stat({ label, value }: any) {
  return <div className="bg-white rounded-xl border border-border p-3 text-center"><p className="text-2xl font-bold text-emerald-700">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
}

function StatusBadge({ status }: any) {
  const cls = status === 'active' ? 'bg-emerald-100 text-emerald-700' : status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
  const label: Record<string, string> = { active: 'Ativo', pending: 'Pendente', rejected: 'Recusado', revoked: 'Revogado', expired: 'Expirado', cancelled: 'Cancelado' }
  return <span className={`text-xs rounded-full px-2 py-0.5 ${cls}`}>{label[status] || status}</span>
}

function scopeItems(scope: any) {
  return Object.keys(scope || {}).filter((key) => scope[key]).map((key) => scopeLabels[key] || key)
}
