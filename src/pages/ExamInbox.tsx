import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  AlertCircle,
  CheckCircle,
  Clipboard,
  FileText,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  approveInboxDocument,
  extractForwardingCode,
  HealthDocumentInboxItem,
  InboundEmailAddress,
  isForwardingConfirmation,
  loadDocumentInbox,
  loadInboundEmailAddress,
  rejectInboxDocument,
} from '@/services/examInbox'

export default function ExamInbox() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [address, setAddress] = useState<InboundEmailAddress | null>(null)
  const [items, setItems] = useState<HealthDocumentInboxItem[]>([])
  const [systemNotice, setSystemNotice] = useState('')
  const [workingItemId, setWorkingItemId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [user])

  async function load() {
    if (!user) return
    setLoading(true)
    setSystemNotice('')

    try {
      const [addressRes, inboxRes] = await Promise.all([
        loadInboundEmailAddress(user.id),
        loadDocumentInbox(user.id),
      ])

      if (addressRes.error) throw addressRes.error
      if (inboxRes.error) throw inboxRes.error

      setAddress(addressRes.data as InboundEmailAddress)
      setItems((inboxRes.data || []) as HealthDocumentInboxItem[])
    } catch (error: any) {
      console.warn('Exam inbox unavailable:', error)
      setSystemNotice('Execute o SQL HEALTHWALLET_EMAIL_INBOX_V1 no Supabase para ativar seu e-mail de entrada de exames.')
    } finally {
      setLoading(false)
    }
  }

  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function copyEmail() {
    if (!address?.email_address) return
    try {
      await navigator.clipboard.writeText(address.email_address)
      toast.success('E-mail copiado')
    } catch {
      toast.error('Não consegui copiar agora.')
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('Código copiado')
    } catch {
      toast.error('Não consegui copiar agora.')
    }
  }

  async function approve(item: HealthDocumentInboxItem) {
    if (!user) return
    if (!item.file_url) {
      toast.info('Este item parece ser uma mensagem de confirmação, não um exame com anexo.')
      return
    }

    setWorkingItemId(item.id)
    try {
      await approveInboxDocument(user.id, item)
      toast.success('Documento adicionado à carteira')
      await load()
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível adicionar o documento.')
    } finally {
      setWorkingItemId(null)
    }
  }

  async function reject(item: HealthDocumentInboxItem) {
    if (!user) return
    if (!confirm('Remover este item da caixa de entrada?')) return

    setWorkingItemId(item.id)
    try {
      await rejectInboxDocument(user.id, item.id)
      toast.success('Item removido')
      await load()
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível remover o item.')
    } finally {
      setWorkingItemId(null)
    }
  }

  const pendingItems = useMemo(() => items.filter((item) => item.status === 'pending_review'), [items])
  const confirmationItems = useMemo(() => pendingItems.filter(isForwardingConfirmation), [pendingItems])
  const documentItems = useMemo(() => pendingItems.filter((item) => item.file_url), [pendingItems])
  const completedItems = useMemo(() => items.filter((item) => item.status !== 'pending_review'), [items])

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>
  }

  return (
    <div className="space-y-5 pb-24">
      <section className="rounded-2xl bg-gradient-to-br from-slate-900 via-emerald-900 to-teal-800 p-5 text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-white/10" />
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-3">
            <Inbox className="w-4 h-4" /> HealthWallet Inbox
          </div>
          <h1 className="text-2xl font-bold">Receber exames por e-mail</h1>
          <p className="text-white/85 text-sm mt-2">
            Encaminhe laudos, exames, receitas e documentos. Eles chegam aqui para você revisar antes de adicionar à carteira.
          </p>
        </div>
      </section>

      {systemNotice && (
        <section className="rounded-xl bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-900 flex gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{systemNotice}</p>
        </section>
      )}

      <section className="bg-white rounded-xl border p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Seu e-mail HealthWallet para exames</p>
            <p className="font-bold text-gray-900 break-all mt-1">{address?.email_address || 'Ainda não disponível'}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={copyEmail}
            disabled={!address?.email_address}
            className="rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <Clipboard className="w-4 h-4" /> Copiar
          </button>
          <button
            type="button"
            onClick={refresh}
            className="rounded-xl bg-slate-900 py-3 font-semibold text-white flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </section>

      <section className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900 flex gap-2">
        <ShieldCheck className="w-5 h-5 flex-shrink-0" />
        <p>
          Nada entra automaticamente na carteira. Todo documento recebido por e-mail fica pendente até você aprovar.
        </p>
      </section>

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <Mail className="w-5 h-5 text-emerald-600" /> Como usar com Gmail
        </h2>
        <div className="space-y-2 text-sm text-gray-700">
          <p>1. Copie seu e-mail HealthWallet.</p>
          <p>2. No Gmail, crie encaminhamento para esse endereço.</p>
          <p>3. Volte aqui para ver o e-mail/código de confirmação.</p>
          <p>4. Crie filtros para remetentes como laboratórios, clínicas ou assuntos com “resultado”, “exame”, “laudo” e “receita”.</p>
        </div>
      </section>

      {confirmationItems.length > 0 && (
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h2 className="font-bold text-amber-900 mb-3">Possíveis confirmações de encaminhamento</h2>
          <div className="space-y-3">
            {confirmationItems.map((item) => {
              const code = extractForwardingCode(item)
              return (
                <div key={item.id} className="rounded-xl bg-white border border-amber-100 p-3 text-sm">
                  <p className="font-semibold text-gray-900">{item.subject || 'Mensagem recebida'}</p>
                  <p className="text-xs text-gray-500 mt-1">{item.from_email || 'Remetente não identificado'}</p>
                  {code && (
                    <button onClick={() => copyCode(code)} className="mt-2 rounded-lg bg-amber-600 text-white px-3 py-2 text-xs font-semibold">
                      Copiar código: {code}
                    </button>
                  )}
                  <p className="text-xs text-gray-600 mt-2 line-clamp-3">{item.body_preview}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-emerald-600" /> Pendentes
          </h2>
          <span className="text-xs rounded-full bg-emerald-50 text-emerald-700 px-2 py-1 font-semibold">{documentItems.length}</span>
        </div>

        {documentItems.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum exame recebido por e-mail ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {documentItems.map((item) => (
              <InboxCard
                key={item.id}
                item={item}
                working={workingItemId === item.id}
                onApprove={() => approve(item)}
                onReject={() => reject(item)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-600" /> Histórico da entrada
        </h2>
        {completedItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada aprovado ou recusado ainda.</p>
        ) : (
          <div className="space-y-2">
            {completedItems.slice(0, 10).map((item) => (
              <div key={item.id} className="rounded-xl border p-3 flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{item.original_file_name || item.file_name || item.subject || 'Documento'}</p>
                  <p className="text-xs text-muted-foreground">{statusLabel(item.status)} • {formatDate(item.received_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Link to="/exams" className="block text-center rounded-xl bg-slate-900 py-3 font-semibold text-white">
        Ver exames na carteira
      </Link>
    </div>
  )
}

function InboxCard({ item, working, onApprove, onReject }: { item: HealthDocumentInboxItem; working: boolean; onApprove: () => void; onReject: () => void }) {
  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 truncate">{item.original_file_name || item.file_name || 'Documento recebido'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {item.suggested_document_type || 'Documento de saúde'} • {formatDate(item.received_at)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            De: {item.from_email || 'remetente não identificado'}
          </p>
          {item.suggested_laboratory && <p className="text-xs text-emerald-700 mt-1">Laboratório provável: {item.suggested_laboratory}</p>}
        </div>
      </div>

      {item.subject && <p className="text-xs text-gray-600 bg-slate-50 rounded-xl p-3">Assunto: {item.subject}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onApprove}
          disabled={working}
          className="rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Adicionar
        </button>
        <button
          onClick={onReject}
          disabled={working}
          className="rounded-xl bg-red-50 py-3 font-semibold text-red-700 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <Trash2 className="w-4 h-4" /> Remover
        </button>
      </div>
    </div>
  )
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending_review: 'Pendente',
    approved: 'Adicionado',
    rejected: 'Removido',
    duplicate: 'Duplicado',
    processing_error: 'Erro',
  }
  return labels[status] || status
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('pt-BR')
}
