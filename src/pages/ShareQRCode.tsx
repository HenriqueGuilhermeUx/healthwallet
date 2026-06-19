import { useState, useEffect } from 'react'
import {
  QrCode,
  Copy,
  Mail,
  MessageCircle,
  Shield,
  Clock,
  X,
  Check,
  Loader2,
  Trash2,
  Share2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { QRCodeSVG } from 'qrcode.react'

interface ShareData {
  summary: boolean
  profile: boolean
  exams: boolean
  medications: boolean
  allergies: boolean
  medscore: boolean
  ai_analysis: boolean
  emergency_contact: boolean
}

interface GeneratedCode {
  id: string
  code: string
  permissions: ShareData
  expires_at: string
  created_at: string
}

const DURATION_OPTIONS = [
  { value: 1, label: '1 hora' },
  { value: 24, label: '24 horas' },
  { value: 168, label: '7 dias' },
  { value: 720, label: '30 dias' },
]

const SHARE_OPTIONS = [
  { key: 'summary', label: 'Resumo', icon: '📄', desc: 'Resumo profissional' },
  { key: 'profile', label: 'Perfil', icon: '👤', desc: 'Dados principais' },
  { key: 'medscore', label: 'MedScore', icon: '📊', desc: 'Pontuação e risco' },
  { key: 'exams', label: 'Exames', icon: '📋', desc: 'Resultados enviados' },
  { key: 'ai_analysis', label: 'Análise IA', icon: '🤖', desc: 'Comentários dos exames' },
  { key: 'allergies', label: 'Alergias', icon: '⚠️', desc: 'Alertas importantes' },
  { key: 'medications', label: 'Remédios', icon: '💊', desc: 'Medicamentos em uso' },
  { key: 'emergency_contact', label: 'Emergência', icon: '☎️', desc: 'Contato de emergência' },
]

export default function ShareQRCode() {
  const { user } = useAuth()

  const [shareData, setShareData] = useState<ShareData>({
    summary: true,
    profile: true,
    exams: true,
    medications: true,
    allergies: true,
    medscore: true,
    ai_analysis: true,
    emergency_contact: true,
  })

  const [duration, setDuration] = useState(24)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [generatedCode, setGeneratedCode] = useState<GeneratedCode | null>(null)
  const [activeTab, setActiveTab] = useState<'qr' | 'link' | 'email'>('qr')
  const [doctorEmail, setDoctorEmail] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [copied, setCopied] = useState(false)
  const [codes, setCodes] = useState<GeneratedCode[]>([])
  const [loadingCodes, setLoadingCodes] = useState(true)

  useEffect(() => {
    if (user) loadCodes()
  }, [user])

  async function loadCodes() {
    if (!user) return

    setLoadingCodes(true)

    const { data } = await supabase
      .from('access_codes')
      .select('*')
      .eq('patient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    setCodes(data || [])
    setLoadingCodes(false)
  }

  async function generateCode() {
    if (!user) return

    if (!Object.values(shareData).some(Boolean)) {
      toast.error('Selecione pelo menos uma informação para compartilhar.')
      return
    }

    setLoading(true)

    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString()

      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + duration)

      const { data, error } = await supabase
        .from('access_codes')
        .insert({
          code,
          patient_id: user.id,
          permissions: shareData,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single()

      if (error) throw error

      setGeneratedCode(data)
      setShowModal(true)
      await loadCodes()
      toast.success('Compartilhamento gerado!')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao gerar compartilhamento.')
    } finally {
      setLoading(false)
    }
  }

  async function deleteCode(id: string) {
    const { error } = await supabase.from('access_codes').delete().eq('id', id)

    if (!error) {
      setCodes((prev) => prev.filter((c) => c.id !== id))
      toast.success('Acesso revogado.')
    }
  }

  function copyToClipboard() {
    if (!generatedCode) return

    navigator.clipboard.writeText(generatedCode.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function getShareLink() {
    if (!generatedCode) return ''
    return `${window.location.origin}/access/${generatedCode.code}`
  }

  function sendEmail() {
    if (!doctorEmail || !generatedCode) return

    const link = getShareLink()
    const subject = encodeURIComponent('HealthWallet - Compartilhamento de Dados de Saúde')
    const body = encodeURIComponent(
      `Olá${doctorName ? ` Dr(a). ${doctorName}` : ''},\n\n` +
      `Estou compartilhando meus dados de saúde pelo HealthWallet.\n\n` +
      `Código de acesso: ${generatedCode.code}\n` +
      `Link: ${link}\n\n` +
      `Este acesso expira em ${formatExpiration(generatedCode.expires_at)}.\n\n` +
      `Atenciosamente`
    )

    window.open(`mailto:${doctorEmail}?subject=${subject}&body=${body}`)
  }

  function formatExpiration(date: string) {
    const expires = new Date(date)
    const now = new Date()
    const diff = expires.getTime() - now.getTime()

    if (diff < 0) return 'Expirado'

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days} dia${days > 1 ? 's' : ''}`
    return `${hours} hora${hours > 1 ? 's' : ''}`
  }

  function isExpired(date: string) {
    return new Date(date) < new Date()
  }

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-xl font-bold">Compartilhar Dados</h1>
        <p className="text-sm text-muted-foreground">
          Escolha o que compartilhar e por quanto tempo.
        </p>
      </div>

      <div className="bg-white rounded-xl border p-4 space-y-4">
        <h3 className="font-medium">O que compartilhar?</h3>

        <div className="grid grid-cols-2 gap-3">
          {SHARE_OPTIONS.map((item) => (
            <label
              key={item.key}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                shareData[item.key as keyof ShareData]
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={shareData[item.key as keyof ShareData]}
                onChange={(e) =>
                  setShareData((prev) => ({
                    ...prev,
                    [item.key]: e.target.checked,
                  }))
                }
                className="sr-only"
              />

              <span className="text-xl">{item.icon}</span>

              <div className="flex-1">
                <p className="font-medium text-sm">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>

              {shareData[item.key as keyof ShareData] && (
                <Check className="w-5 h-5 text-emerald-600" />
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border p-4">
        <h3 className="font-medium mb-3">Prazo de acesso</h3>

        <div className="grid grid-cols-4 gap-2">
          {DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDuration(opt.value)}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                duration === opt.value
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={generateCode}
        disabled={loading || !Object.values(shareData).some(Boolean)}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Gerando...
          </>
        ) : (
          <>
            <QrCode className="w-5 h-5" />
            Compartilhar
          </>
        )}
      </button>

      {codes.length > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-medium mb-3">Compartilhamentos ativos</h3>

          <div className="space-y-2">
            {loadingCodes ? (
              <div className="text-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mx-auto" />
              </div>
            ) : (
              codes.map((code) => (
                <div
                  key={code.id}
                  className={`flex items-center justify-between p-3 rounded-xl border ${
                    isExpired(code.expires_at)
                      ? 'bg-gray-50 border-gray-200'
                      : 'bg-emerald-50 border-emerald-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-lg">{code.code}</span>

                    <div>
                      <p className="text-sm text-gray-600">
                        {isExpired(code.expires_at)
                          ? 'Expirado'
                          : `Expira em ${formatExpiration(code.expires_at)}`}
                      </p>

                      <p className="text-xs text-gray-400">
                        {new Date(code.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => deleteCode(code.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {showModal && generatedCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold">Compartilhamento gerado</h2>

              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <div className="text-center mb-6">
                <p className="text-sm text-gray-500 mb-2">Código de acesso</p>

                <p className="text-4xl font-mono font-bold text-emerald-600 tracking-widest">
                  {generatedCode.code}
                </p>

                <p className="text-sm text-gray-500 mt-2">
                  Expira em {formatExpiration(generatedCode.expires_at)}
                </p>
              </div>

              <div className="flex gap-2 mb-4">
                {[
                  { key: 'qr', label: 'QR Code', icon: QrCode },
                  { key: 'link', label: 'Código', icon: Copy },
                  { key: 'email', label: 'E-mail', icon: Mail },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as any)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium ${
                      activeTab === tab.key
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'qr' && (
                <div className="text-center">
                  <div className="w-48 h-48 bg-white rounded-xl mx-auto mb-4 flex items-center justify-center p-4 border">
                    <QRCodeSVG
                      value={getShareLink() || generatedCode.code}
                      size={160}
                      level="M"
                      includeMargin
                    />
                  </div>

                  <p className="text-sm text-gray-600 mb-4">
                    O profissional pode escanear o QR Code ou digitar o código.
                  </p>
                </div>
              )}

              {activeTab === 'link' && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <p className="text-sm text-gray-500 mb-2">Código</p>

                    <p className="text-3xl font-mono font-bold text-emerald-600 tracking-widest">
                      {generatedCode.code}
                    </p>
                  </div>

                  <button
                    onClick={copyToClipboard}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-medium"
                  >
                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    {copied ? 'Copiado!' : 'Copiar Código'}
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const text = encodeURIComponent(
                          `Acesse meus dados de saúde no HealthWallet.\nCódigo: ${generatedCode.code}\nLink: ${getShareLink()}`
                        )
                        window.open(`https://wa.me/?text=${text}`)
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500 text-white font-medium"
                    >
                      <MessageCircle className="w-5 h-5" />
                      WhatsApp
                    </button>

                    <button
                      onClick={copyToClipboard}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 font-medium"
                    >
                      <Share2 className="w-5 h-5" />
                      Copiar
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'email' && (
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Nome do profissional"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border outline-none"
                  />

                  <input
                    type="email"
                    placeholder="profissional@clinica.com"
                    value={doctorEmail}
                    onChange={(e) => setDoctorEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border outline-none"
                  />

                  <button
                    onClick={sendEmail}
                    disabled={!doctorEmail}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-medium disabled:opacity-50"
                  >
                    <Mail className="w-5 h-5" />
                    Enviar por E-mail
                  </button>
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Shield className="w-4 h-4" />
                <span>Você pode revogar este acesso a qualquer momento.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
