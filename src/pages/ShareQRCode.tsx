import { useState, useEffect } from 'react'
import { QrCode, Copy, Mail, MessageCircle, Shield, Clock, X, Check, Loader2, Trash2, Share2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { QRCodeSVG } from 'qrcode.react'

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
  { key: 'ai_analysis', label: 'Análise IA', icon: '🤖', desc: 'Interpretação dos exames' },
  { key: 'medications', label: 'Medicamentos', icon: '💊', desc: 'Medicamentos em uso' },
  { key: 'allergies', label: 'Alergias', icon: '⚠️', desc: 'Alertas importantes' },
  { key: 'passport', label: 'Passport', icon: '🛡️', desc: 'Emergência e prontuário' },
  { key: 'emergency_contact', label: 'Emergência', icon: '☎️', desc: 'Contato de emergência' },
  { key: 'health_plan', label: 'Plano/SUS', icon: '💳', desc: 'Carteiras cadastradas' },
  { key: 'family_history', label: 'Hist. familiar', icon: '👨‍👩‍👧', desc: 'Histórico familiar' },
]

export default function ShareQRCode() {
  const { user } = useAuth()

  const [shareData, setShareData] = useState<ShareData>({
    summary: true,
    profile: true,
    medscore: true,
    exams: true,
    ai_analysis: true,
    medications: true,
    allergies: true,
    passport: true,
    emergency_contact: true,
    health_plan: true,
    family_history: false,
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
      toast.error('Selecione pelo menos uma categoria.')
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
          share_categories: shareData,
          expires_at: expiresAt.toISOString(),
          revoked: false,
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

  async function revokeCode(id: string) {
    const { error } = await supabase.from('access_codes').update({ revoked: true, revoked_at: new Date().toISOString() }).eq('id', id)
    if (!error) {
      toast.success('Acesso revogado.')
      loadCodes()
    }
  }

  async function deleteCode(id: string) {
    const { error } = await supabase.from('access_codes').delete().eq('id', id)
    if (!error) {
      setCodes((prev) => prev.filter((c) => c.id !== id))
      toast.success('Código excluído.')
    }
  }

  function getShareLink() {
    if (!generatedCode) return ''
    return `${window.location.origin}/access/${generatedCode.code}`
  }

  function buildProfessionalInstructions() {
    if (!generatedCode) return ''
    return [
      `HealthWallet - acesso temporário aos meus dados de saúde`,
      ``,
      `1. Abra este link no navegador:`,
      `${getShareLink()}`,
      ``,
      `2. Se o link pedir código, digite: ${generatedCode.code}`,
      ``,
      `3. O acesso expira em ${formatExpiration(generatedCode.expires_at)} e eu posso revogar a qualquer momento.`,
      ``,
      `Observação: os dados compartilhados são apenas os autorizados por mim no HealthWallet.`,
    ].join('\n')
  }

  async function copyToClipboard() {
    if (!generatedCode) return
    await navigator.clipboard.writeText(buildProfessionalInstructions())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function sendEmail() {
    if (!doctorEmail || !generatedCode) return
    const subject = encodeURIComponent('HealthWallet - acesso temporário aos dados de saúde')
    const greeting = doctorName ? `Olá Dr(a). ${doctorName},\n\n` : 'Olá,\n\n'
    const body = encodeURIComponent(greeting + buildProfessionalInstructions() + '\n\nAtenciosamente')
    window.open(`mailto:${doctorEmail}?subject=${subject}&body=${body}`)
  }

  function sendWhatsApp() {
    if (!generatedCode) return
    const text = encodeURIComponent(buildProfessionalInstructions())
    window.open(`https://wa.me/?text=${text}`)
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

  function isInactive(code: GeneratedCode) {
    return Boolean(code.revoked) || isExpired(code.expires_at)
  }

  return (
    <div className="space-y-6 pb-28">
      <div>
        <h1 className="text-xl font-bold">Compartilhar Dados</h1>
        <p className="text-sm text-muted-foreground">Escolha categorias, prazo e gere um QR Code seguro.</p>
      </div>

      <div className="rounded-xl border bg-blue-50 p-4 text-sm text-blue-900">
        <strong>Para médicos e profissionais:</strong> o app gera link, código, QR Code e uma mensagem pronta explicando como acessar.
      </div>

      <div className="bg-white rounded-xl border p-4 space-y-4">
        <h3 className="font-medium">Categorias de compartilhamento</h3>
        <div className="grid grid-cols-2 gap-3">
          {SHARE_OPTIONS.map((item) => (
            <label key={item.key} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${shareData[item.key as keyof ShareData] ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input type="checkbox" checked={shareData[item.key as keyof ShareData]} onChange={(e) => setShareData((prev) => ({ ...prev, [item.key]: e.target.checked }))} className="sr-only" />
              <span className="text-xl">{item.icon}</span>
              <div className="flex-1">
                <p className="font-medium text-sm">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
              {shareData[item.key as keyof ShareData] && <Check className="w-5 h-5 text-emerald-600" />}
            </label>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border p-4">
        <h3 className="font-medium mb-3">Prazo de acesso</h3>
        <div className="grid grid-cols-4 gap-2">
          {DURATION_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => setDuration(opt.value)} className={`py-2 px-3 rounded-lg text-sm font-medium ${duration === opt.value ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <button onClick={generateCode} disabled={loading || !Object.values(shareData).some(Boolean)} className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50">
        {loading ? <><Loader2 className="w-5 h-5 animate-spin" />Gerando...</> : <><QrCode className="w-5 h-5" />Compartilhar</>}
      </button>

      {codes.length > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-medium mb-3">Compartilhamentos</h3>
          <div className="space-y-2">
            {loadingCodes ? <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mx-auto" /> : codes.map((code) => (
              <div key={code.id} className={`p-3 rounded-xl border ${isInactive(code) ? 'bg-gray-50 border-gray-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono font-bold text-lg">{code.code}</p>
                    <p className="text-sm text-gray-600">{code.revoked ? 'Revogado' : isExpired(code.expires_at) ? 'Expirado' : `Expira em ${formatExpiration(code.expires_at)}`}</p>
                  </div>
                  <div className="flex gap-2">
                    {!isInactive(code) && <button onClick={() => revokeCode(code.id)} className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg"><Shield className="w-4 h-4" /></button>}
                    <button onClick={() => deleteCode(code.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && generatedCode && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold">Compartilhamento gerado</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
            </div>

            <div className="overflow-y-auto p-4">
              <div className="text-center mb-5">
                <p className="text-sm text-gray-500 mb-2">Código de acesso</p>
                <p className="text-4xl font-mono font-bold text-emerald-600 tracking-widest">{generatedCode.code}</p>
                <p className="text-sm text-gray-500 mt-2">Expira em {formatExpiration(generatedCode.expires_at)}</p>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 mb-4">
                <strong>Orientação para o profissional:</strong> envie o link ou QR Code. Ele abre no navegador, sem precisar instalar o app do paciente.
              </div>

              <div className="flex gap-2 mb-4">
                {[{ key: 'qr', label: 'QR Code', icon: QrCode }, { key: 'link', label: 'Mensagem', icon: Copy }, { key: 'email', label: 'E-mail', icon: Mail }].map((tab) => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium ${activeTab === tab.key ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                    <tab.icon className="w-4 h-4" />{tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'qr' && (
                <div className="text-center">
                  <div className="w-48 h-48 bg-white rounded-xl mx-auto mb-4 flex items-center justify-center p-4 border">
                    <QRCodeSVG value={getShareLink()} size={160} level="M" includeMargin />
                  </div>
                  <p className="text-sm text-gray-600">O profissional pode escanear o QR Code, abrir o link ou digitar o código.</p>
                </div>
              )}

              {activeTab === 'link' && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-gray-50 border p-3 text-xs whitespace-pre-line text-gray-700">{buildProfessionalInstructions()}</div>
                  <button onClick={copyToClipboard} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-medium">
                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}{copied ? 'Copiado!' : 'Copiar mensagem completa'}
                  </button>
                  <button onClick={sendWhatsApp} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500 text-white font-medium">
                    <MessageCircle className="w-5 h-5" />Enviar por WhatsApp
                  </button>
                </div>
              )}

              {activeTab === 'email' && (
                <div className="space-y-4">
                  <input type="text" placeholder="Nome do profissional" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" />
                  <input type="email" placeholder="profissional@clinica.com" value={doctorEmail} onChange={(e) => setDoctorEmail(e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" />
                  <button onClick={sendEmail} disabled={!doctorEmail} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-medium disabled:opacity-50">
                    <Mail className="w-5 h-5" />Enviar por E-mail
                  </button>
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t flex items-center gap-2 text-sm text-gray-600">
              <Shield className="w-4 h-4" />Você pode revogar este acesso a qualquer momento.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
