import { useState } from 'react'
import { QrCode, Copy, CheckCircle, Share2, Download, Mail, MessageCircle, Eye, Shield, Clock, X, Check } from 'lucide-react'

interface ShareData {
  profile: boolean
  exams: boolean
  medications: boolean
  lastExams: boolean
}

export default function ShareQRCode() {
  const [showModal, setShowModal] = useState(false)
  const [generatedLink, setGeneratedLink] = useState('')
  const [shareData, setShareData] = useState<ShareData>({
    profile: true,
    exams: true,
    medications: true,
    lastExams: true,
  })
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'qr' | 'link' | 'email'>('qr')
  const [doctorEmail, setDoctorEmail] = useState('')
  const [doctorName, setDoctorName] = useState('')

  const generateLink = () => {
    // Gerar token único (simplificado)
    const token = btoa(Date.now().toString() + Math.random().toString())
    const baseUrl = window.location.origin
    setGeneratedLink(`${baseUrl}/share/${token}`)
    setShowModal(true)
  }

  const copyToClipboard = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const downloadQRCode = () => {
    // Simular download de QR Code
    const canvas = document.createElement('canvas')
    canvas.width = 300
    canvas.height = 300
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, 300, 300)
      ctx.fillStyle = 'black'
      ctx.font = '16px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('HealthWallet', 150, 150)
      ctx.font = '12px Arial'
      ctx.fillText('Escaneie para acessar', 150, 180)
    }
    const link = document.createElement('a')
    link.download = 'healthwallet-qrcode.png'
    link.href = canvas.toDataURL()
    link.click()
  }

  const sendEmail = () => {
    if (!doctorEmail) return
    const subject = encodeURIComponent('HealthWallet - Compartilhamento de Saúde')
    const body = encodeURIComponent(
      `Olá${doctorName ? ` Dr(a). ${doctorName}` : ''},\n\n` +
      `Estou compartilhando meu histórico de saúde com você através do HealthWallet.\n\n` +
      `Acesse aqui: ${generatedLink}\n\n` +
      `Atenciosamente`
    )
    window.open(`mailto:${doctorEmail}?subject=${subject}&body=${body}`)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Compartilhar Dados</h1>
        <p className="text-sm text-muted-foreground">Gere um QR Code ou link para compartilhar com profissionais de saúde</p>
      </div>

      {/* Data Selection */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <h3 className="font-medium">O que deseja compartilhar?</h3>

        {[
          { key: 'profile', label: 'Perfil de Saúde', desc: 'Dados pessoais, tipo sanguíneo, IMC' },
          { key: 'medications', label: 'Medicamentos', desc: 'Lista de medicamentos em uso' },
          { key: 'allergies', label: 'Alergias', desc: 'Alergias e condições importantes' },
          { key: 'lastExams', label: 'Últimos Exames', desc: 'Resultados dos últimos exames' },
        ].map((item) => (
          <label key={item.key} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={shareData[item.key as keyof ShareData] ?? true}
              onChange={(e) => setShareData(prev => ({ ...prev, [item.key]: e.target.checked }))}
              className="mt-1 w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <p className="font-medium text-sm">{item.label}</p>
              <p className="text-xs text-gray-500">{item.desc}</p>
            </div>
          </label>
        ))}
      </div>

      {/* Generate Button */}
      <button
        onClick={generateLink}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
      >
        <QrCode className="w-5 h-5" />
        Gerar QR Code e Link
      </button>

      {/* Info Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 rounded-xl p-4">
          <Clock className="w-5 h-5 text-blue-600 mb-2" />
          <p className="font-medium text-sm text-blue-900">Temporário</p>
          <p className="text-xs text-blue-700">Link expira em 24h</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <Shield className="w-5 h-5 text-green-600 mb-2" />
          <p className="font-medium text-sm text-green-900">Seguro</p>
          <p className="text-xs text-green-700">Dados criptografados</p>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold">Compartilhar Dados</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4">
              {/* Tabs */}
              <div className="flex gap-2 mb-4">
                {[
                  { key: 'qr', label: 'QR Code', icon: QrCode },
                  { key: 'link', label: 'Link', icon: Copy },
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
                    Mostre este QR Code para o profissional de saúde
                  </p>
                  <button
                    onClick={downloadQRCode}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 font-medium hover:bg-gray-50"
                  >
                    <Download className="w-5 h-5" />
                    Baixar QR Code
                  </button>
                </div>
              )}

              {/* Link Tab */}
              {activeTab === 'link' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Link de Compartilhamento</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={generatedLink}
                        readOnly
                        className="flex-1 px-3 py-2 rounded-lg bg-gray-50 text-sm border"
                      />
                      <button
                        onClick={copyToClipboard}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const text = encodeURIComponent(`Acesse meu histórico de saúde: ${generatedLink}`)
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
                      className="w-full px-3 py-2 rounded-lg border"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">E-mail</label>
                    <input
                      type="email"
                      placeholder="profissional@clinica.com"
                      value={doctorEmail}
                      onChange={(e) => setDoctorEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border"
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
                <span>Link válido por 24 horas. Você pode revogar a qualquer momento.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}