import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Loader2, MessageCircle, QrCode, Shield, Trash2, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

interface ShareData {
  summary: boolean
  profile: boolean
  medscore: boolean
  exams: boolean
  ai_analysis: boolean
  medications: boolean
  allergies: boolean
  passport: boolean
  emergency_contact: boolean
  health_plan: boolean
  family_history: boolean
}

interface GeneratedCode {
  id: string
  code: string
  permissions: ShareData
  share_categories?: ShareData
  expires_at: string
  created_at: string
  revoked?: boolean
  professional_id?: string | null
  used_at?: string | null
}

const DURATION_OPTIONS = [
  { value: 1, label: '1 hora' },
  { value: 24, label: '24 horas' },
  { value: 168, label: '7 dias' },
  { value: 720, label: '30 dias' },
]

const SHARE_OPTIONS: Array<{ key: keyof ShareData; label: string; desc: string; icon: string }> = [
  { key: 'summary', label: 'Resumo', desc: 'Resumo profissional', icon: '📄' },
  { key: 'profile', label: 'Perfil', desc: 'Dados principais', icon: '👤' },
  { key: 'medscore', label: 'MedScore', desc: 'Pontuação e risco', icon: '📊' },
  { key: 'exams', label: 'Exames', desc: 'Resultados enviados', icon: '📋' },
  { key: 'ai_analysis', label: 'Análise IA', desc: 'Interpretação já existente', icon: '🤖' },
  { key: 'medications', label: 'Medicamentos', desc: 'Medicamentos em uso', icon: '💊' },
  { key: 'allergies', label: 'Alergias', desc: 'Alertas importantes', icon: '⚠️' },
  { key: 'passport', label: 'Passport', desc: 'Eventos clínicos autorizados', icon: '🛡️' },
  { key: 'emergency_contact', label: 'Emergência', desc: 'Contato de emergência', icon: '☎️' },
  { key: 'health_plan', label: 'Plano/SUS', desc: 'Carteiras cadastradas', icon: '💳' },
  { key: 'family_history', label: 'Hist. familiar', desc: 'Histórico familiar', icon: '👨‍👩‍👧' },
]

const DEFAULT_SHARE: ShareData = {
  summary: true,
  profile: true,
  medscore: true,
  exams: true,
  ai_analysis: false,
  medications: true,
  allergies: true,
  passport: true,
  emergency_contact: true,
  health_plan: true,
  family_history: false,
}

function isSecureToken(code?: string | null) {
  return Boolean(code && /^HW-[0-9A-F]{36}$/i.test(code))
}

function isRpcUnavailable(error: any) {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()
  return code === 'PGRST202' || message.includes('create_health_access_code') || message.includes('schema cache')
}

export default function ShareQRCode() {
  const { user } = useAuth()
  const [shareData, setShareData] = useState<ShareData>(DEFAULT_SHARE)
  const [duration, setDuration] = useState(24)
  const [loading, setLoading] = useState(false)
  const [loadingCodes, setLoadingCodes] = useState(false)
  const [codes, setCodes] = useState<GeneratedCode[]>([])
  const [generatedCode, setGeneratedCode] = useState<GeneratedCode | null>(null)
  const [copied, setCopied] = useState(false)

  const hasSelection = useMemo(() => Object.values(shareData).some(Boolean), [shareData])

  useEffect(() => {
    if (user) void loadCodes()
    else setCodes([])
  }, [user?.id])

  async function loadCodes() {
    if (!user) return
    setLoadingCodes(true)

    // Deliberately select only columns that exist both before and after V2.
    // This allows the secure frontend to be deployed before the DB migration,
    // while refusing to create any new insecure legacy code.
    const { data, error } = await supabase
      .from('access_codes')
      .select('id,code,permissions,share_categories,expires_at,created_at,revoked,professional_id,used_at')
      .eq('patient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error(error)
      toast.error('Não foi possível carregar os compartilhamentos.')
    } else {
      setCodes((data || []) as GeneratedCode[])
    }
    setLoadingCodes(false)
  }

  async function generateCode() {
    if (!user) {
      toast.error('Entre na sua conta para compartilhar dados.')
      return
    }
    if (!hasSelection) {
      toast.error('Selecione pelo menos uma categoria.')
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('create_health_access_code', {
        p_permissions: shareData,
        p_duration_hours: duration,
      })
      if (error) throw error

      const row = (Array.isArray(data) ? data[0] : data) as GeneratedCode | null
      if (!row?.id || !isSecureToken(row.code)) throw new Error('secure_share_generation_failed')

      setGeneratedCode(row)
      await loadCodes()
      toast.success('Compartilhamento seguro gerado.')
    } catch (error: any) {
      console.error(error)
      if (isRpcUnavailable(error)) {
        toast.error('O compartilhamento seguro está em atualização. Nenhum código inseguro será gerado durante a transição.')
      } else {
        toast.error('Erro ao gerar o compartilhamento seguro.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function revokeCode(id: string) {
    if (!user) return
    const { error } = await supabase
      .from('access_codes')
      .update({ revoked: true, revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('patient_id', user.id)

    if (error) {
      toast.error('Não foi possível revogar o acesso.')
      return
    }
    toast.success('Acesso revogado imediatamente.')
    await loadCodes()
  }

  async function deleteCode(id: string) {
    if (!user) return
    const { error } = await supabase
      .from('access_codes')
      .delete()
      .eq('id', id)
      .eq('patient_id', user.id)

    if (error) {
      toast.error('Não foi possível excluir o compartilhamento.')
      return
    }
    setCodes((current) => current.filter((item) => item.id !== id))
    toast.success('Compartilhamento excluído.')
  }

  function shareLink(item: GeneratedCode) {
    return `${window.location.origin}/access/${encodeURIComponent(item.code)}`
  }

  function instructions(item: GeneratedCode) {
    return [
      'HealthWallet — acesso temporário aos meus dados de saúde',
      '',
      `Abra: ${shareLink(item)}`,
      '',
      'Por segurança, o acesso só é liberado após o profissional entrar com sua conta profissional MyDataMed/HealthWallet.',
      'O primeiro profissional que resgatar este token fica vinculado a ele até expiração ou revogação.',
      `Expira em: ${new Date(item.expires_at).toLocaleString('pt-BR')}`,
      '',
      'O paciente pode revogar o acesso a qualquer momento.',
    ].join('\n')
  }

  async function copyInstructions(item: GeneratedCode) {
    await navigator.clipboard.writeText(instructions(item))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  function sendWhatsApp(item: GeneratedCode) {
    window.open(`https://wa.me/?text=${encodeURIComponent(instructions(item))}`, '_blank', 'noopener,noreferrer')
  }

  function isExpired(item: GeneratedCode) {
    return new Date(item.expires_at).getTime() <= Date.now()
  }

  if (!user) {
    return (
      <div className="space-y-5 pb-28">
        <div>
          <h1 className="text-xl font-bold">Compartilhar Dados</h1>
          <p className="text-sm text-muted-foreground">Entre na sua conta para criar um compartilhamento clínico seguro.</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          O novo compartilhamento não usa mais código público de 6 dígitos. A geração acontece no servidor e o acesso fica vinculado ao profissional autenticado que o resgatar.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-28">
      <div>
        <h1 className="text-xl font-bold">Compartilhar Dados</h1>
        <p className="text-sm text-muted-foreground">Você escolhe exatamente o que o profissional poderá consultar e por quanto tempo.</p>
      </div>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <div className="flex gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Compartilhamento vinculado ao profissional</p>
            <p className="mt-1 text-emerald-800">O link sozinho não abre seu prontuário. O profissional precisa estar autenticado e o primeiro resgate vincula o token à conta profissional.</p>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border bg-white p-4">
        <h2 className="mb-3 font-semibold">Categorias autorizadas</h2>
        <div className="grid grid-cols-2 gap-3">
          {SHARE_OPTIONS.map((item) => {
            const selected = shareData[item.key]
            return (
              <button
                type="button"
                key={item.key}
                onClick={() => setShareData((current) => ({ ...current, [item.key]: !current[item.key] }))}
                className={`rounded-xl border p-3 text-left transition ${selected ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex items-start gap-2">
                  <span>{item.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                  {selected && <Check className="h-4 w-4 text-emerald-600" />}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <h2 className="mb-3 font-semibold">Prazo</h2>
        <div className="grid grid-cols-4 gap-2">
          {DURATION_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.value}
              onClick={() => setDuration(option.value)}
              className={`rounded-xl px-2 py-2 text-sm font-medium ${duration === option.value ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={generateCode}
        disabled={loading || !hasSelection}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 font-semibold text-white disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />}
        {loading ? 'Gerando token seguro...' : 'Gerar compartilhamento seguro'}
      </button>

      <section className="rounded-2xl border bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Compartilhamentos</h2>
          {loadingCodes && <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />}
        </div>

        {codes.length === 0 && !loadingCodes ? (
          <p className="text-sm text-gray-500">Nenhum compartilhamento criado.</p>
        ) : (
          <div className="space-y-2">
            {codes.map((item) => {
              const inactive = Boolean(item.revoked) || isExpired(item)
              const secure = isSecureToken(item.code)
              const redeemed = Boolean(item.professional_id || item.used_at)
              return (
                <div key={item.id} className={`rounded-xl border p-3 ${inactive || !secure ? 'bg-gray-50' : 'border-emerald-200 bg-emerald-50'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-bold">{secure ? item.code : 'Código legado'}</p>
                      <p className="text-xs text-gray-500">
                        {item.revoked
                          ? 'Revogado'
                          : isExpired(item)
                            ? 'Expirado'
                            : !secure
                              ? 'Somente histórico — gere um novo token seguro após a atualização'
                              : redeemed
                                ? 'Resgatado por profissional'
                                : 'Aguardando resgate profissional'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {!inactive && secure && (
                        <button type="button" onClick={() => setGeneratedCode(item)} className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-100" aria-label="Abrir QR Code">
                          <QrCode className="h-4 w-4" />
                        </button>
                      )}
                      {!inactive && (
                        <button type="button" onClick={() => revokeCode(item.id)} className="rounded-lg p-2 text-orange-600 hover:bg-orange-50" aria-label="Revogar acesso">
                          <Shield className="h-4 w-4" />
                        </button>
                      )}
                      <button type="button" onClick={() => deleteCode(item.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label="Excluir compartilhamento">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {generatedCode && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-bold">Compartilhamento seguro</h2>
                <p className="text-xs text-gray-500">Login profissional obrigatório</p>
              </div>
              <button type="button" onClick={() => setGeneratedCode(null)} className="rounded-full p-2 hover:bg-gray-100" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mx-auto mb-4 flex h-52 w-52 items-center justify-center rounded-2xl border bg-white p-4">
              <QRCodeSVG value={shareLink(generatedCode)} size={176} level="M" includeMargin />
            </div>

            <p className="mb-4 break-all text-center font-mono text-xs text-gray-500">{generatedCode.code}</p>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => copyInstructions(generatedCode)} className="flex items-center justify-center gap-2 rounded-xl bg-gray-100 py-3 text-sm font-semibold">
                <Copy className="h-4 w-4" />{copied ? 'Copiado' : 'Copiar'}
              </button>
              <button type="button" onClick={() => sendWhatsApp(generatedCode)} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white">
                <MessageCircle className="h-4 w-4" />WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
