import { useState, useEffect } from 'react'
import { QrCode, Copy, CheckCircle, Share2, Download, Mail, MessageCircle, Shield, Clock, X, Check, Loader2, Trash2, Eye, Send } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface ShareData {
  profile: boolean
  exams: boolean
  medications: boolean
  allergies: boolean
  medscore: boolean
  ai_analysis: boolean
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

export default function ShareQRCode() {
  const { user } = useAuth()
  const [shareData, setShareData] = useState<ShareData>({
    profile: true,
    exams: true,
    medications: false,
    allergies: true,
    medscore: true,
    ai_analysis: true,
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
    if (user) {
      loadCodes()
    }
  }, [user])

  const loadCodes = async () => {
    if (!user) return

    setLoadingCodes(true)
    const { data } = await supabase
      .from('access_codes')
      .select('*')
      .eq('patient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (data) {
      setCodes(data)
    }
    setLoadingCodes(false)
  }

  const generateCode = async () => {
    if (!user) return

    setLoading(true)

    try {
      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString()

      // Calculate expiration
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
      loadCodes()
      toast.success('Código gerado com sucesso!')
    } catch (err) {
      console.error('Error generating code:', err)
      toast.error('Erro ao gerar código')
    } finally {
      setLoading(false)
    }
  }

  const deleteCode = async (id: string) => {
    const { error } = await supabase.from('access_codes').delete().eq('id', id)

    if (!error) {
      setCodes(prev => prev.filter(c => c.id !== id))
      toast.success('Código excluído')
    }
  }

  const copyToClipboard = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const getShareLink = () => {
    if (generatedCode) {
      return `https://healthwallet.pro/access/${generatedCode.code}`
    }
    return ''
  }

  const sendEmail = () => {
    if (!doctorEmail || !generatedCode) return

    const link = getShareLink()
    const subject = encodeURIComponent('HealthWallet - Compartilhamento de Dados de Saúde')
    const body = encodeURIComponent(
      `Olá${doctorName ? ` Dr(a). ${doctorName}` : ''},\n\n` +
      `Estou compartilhando meu histórico de saúde com você através do HealthWallet.\n\n` +
      `Código de acesso: ${generatedCode.code}\n` +
      `Ou acesse diretamente: ${link}\n\n` +
      `Este link expira em ${duration} hora${duration > 1 ? 's' : ''}.\n\n` +
      `Atenciosamente`
    )
    window.open(`mailto:${doctorEmail}?subject=${subject}&body=${body}`)
  }

  const formatExpiration = (date: string) => {
    const expires = new Date(date)
    const now = new Date()
    const diff = expires.getTime() - now.getTime()

    if (diff < 0) return 'Expirado'

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days} dia${days > 1 ? 's' : ''}`
    return `${hours} hora${hours > 1 ? 's' : ''}`
  }

  const isExpired = (date: string) => {
    return new Date(date) < new Date()
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Compartilhar Dados</h1>
        <p className="text-sm text-muted-foreground">Gere um código para profissionais de saúde acessarem seus dados</p>
      </div>

      {/* Data Selection */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <h3 className="font-medium">O que deseja compartilhar?</h3>

        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'profile', label: 'Perfil', icon: '👤', desc: 'Dados pessoais' },
            { key: 'medscore', label: 'MedScore', icon: '📊', desc: 'Sua pontuação' },
            { key: 'exams', label: 'Exames', icon: '📋', desc: 'Resultados' },
            { key: 'ai_analysis', label: 'Análise IA', icon: '🤖', desc: 'Interpretação' },
            { key: 'allergies', label: 'Alergias', icon: '⚠️', desc: 'Alergias' },
            { key: 'medications', label: 'Remédios', icon: '💊', desc: 'Em uso' },
          ].map((item) => (
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
                onChange={(e) => setShareData(prev => ({ ...prev, [item.key]: e.target.checked }))}
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

      {/* Duration Selection */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="font-medium mb-3">Validade do código</h3>
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

      {/* Generate Button */}
      <button
        onClick={generateCode}
        disabled={loading || !Object.values(shareData).some(v => v)}
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
            Gerar Código de Acesso
          </>
        )}
      </button>

      {/* Info Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 rounded-xl p-4">
          <Clock className="w-5 h-5 text-blue-600 mb-2" />
          <p className="font-medium text-sm text-blue-900">Temporário</p>
          <p className="text-xs text-blue-700">Expira automaticamente</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <Shield className="w-5 h-5 text-green-600 mb-2" />
          <p className="font-medium text-sm text-green-900">Seguro</p>
          <p className="text-xs text-green-700">Dados criptografados</p>
        </div>
      </div>

      {/* Previous Codes */}
      {codes.length > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-medium mb-3">Códigos Gerados</h3>
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
                    isExpired(code.expires_at) ? 'bg-gray-50 border-gray-200' : 'bg-emerald-50 border-emerald-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-lg">{code.code}</span>
                    <div>
                      <p className="text-sm text-gray-600">
                        {isExpired(code.expires_at) ? 'Expirado' : `Expira em ${formatExpiration(code.expires_at)}`}
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

      {/* Modal */}
      {showModal && generatedCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold">Código Gerado!</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4">
              {/* Code Display */}
              <div className="text-center mb-6">
                <p className="text-sm text-gray-500 mb-2">Código de Acesso</p>
                <p className="text-4xl font-mono font-bold text-emerald-600 tracking-widest">
                  {generatedCode.code}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Expira em {formatExpiration(generatedCode.expires_at)}
                </p>
              </div>

              {/* Tabs */}
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

              {/* QR Code Tab */}
              {activeTab === 'qr' && (
                <div className="text-center">
                  <div className="w-48 h-48 bg-gray-100 rounded-xl mx-auto mb-4 flex items-center justify-center">
                    <QrCode className="w-32 h-32 text-gray-800" />
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    O profissional escaneia este QR Code ou digita o código manualmente
                  </p>
                  <button
                    onClick={() => setActiveTab('link')}
                    className="w-full py-2 text-emerald-600 font-medium"
                  >
                    Ver código numérico
                  </button>
                </div>
              )}

              {/* Link Tab */}
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
                        const text = encodeURIComponent(`Acesse meus dados de saúde no HealthWallet.\nCódigo: ${generatedCode.code}\nLink: ${getShareLink()}`)
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
                      Compartilhar
                    </button>
                  </div>
                </div>
              )}

              {/* Email Tab */}
              {activeTab === 'email' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Nome do Profissional</label>
                    <input
                      type="text"
                      placeholder="Dr(a). Nome"
                      value={doctorName}
                      onChange={(e) => setDoctorName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">E-mail</label>
                    <input
                      type="email"
                      placeholder="profissional@clinica.com"
                      value={doctorEmail}
                      onChange={(e) => setDoctorEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border focus:border-emerald-500 outline-none"
                    />
                  </div>
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

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Shield className="w-4 h-4" />
                <span>Você pode excluir este código a qualquer momento</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
