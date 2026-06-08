import { useState } from 'react'
import { ShieldCheck, CheckCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

async function sha256(text: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))

  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default function Consent() {
  const { user } = useAuth()
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [savedHash, setSavedHash] = useState('')

  const consentText = `
Autorizo o HealthWallet a compartilhar, de forma temporária e controlada, meus dados de saúde selecionados por mim com profissionais de saúde.

Entendo que posso escolher quais informações compartilhar, por quanto tempo o acesso ficará disponível e posso revogar/excluir códigos de acesso a qualquer momento.

Esta autorização não substitui consulta médica, não autoriza uso comercial dos meus dados e serve apenas para facilitar atendimento, análise clínica e continuidade do cuidado.
`.trim()

  async function saveConsent() {
    if (!user) return

    if (!accepted) {
      toast.error('Você precisa aceitar o termo para continuar')
      return
    }

    setLoading(true)

    try {
      const now = new Date().toISOString()
      const fullText = `${consentText}\n\nPaciente: ${user.id}\nData: ${now}`
      const hash = await sha256(fullText)

      const { error } = await supabase.from('health_consents').insert({
        patient_id: user.id,
        consent_type: 'share_health_data',
        consent_text: consentText,
        consent_hash: hash,
        permissions: {
          profile: true,
          exams: true,
          medications: true,
          allergies: true,
          medscore: true,
          ai_analysis: true,
        },
      })

      if (error) throw error

      setSavedHash(hash)
      toast.success('Consentimento registrado com sucesso')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao registrar consentimento')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Consentimento Digital</h1>
        <p className="text-sm text-muted-foreground">
          Autorize o compartilhamento controlado dos seus dados de saúde.
        </p>
      </div>

      <div className="bg-white rounded-xl border p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
          </div>

          <div>
            <p className="font-semibold">TCLE / Consentimento de Compartilhamento</p>
            <p className="text-xs text-gray-500">
              Registro com hash SHA-256 e data de aceite.
            </p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-line border">
          {consentText}
        </div>

        <label className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1"
          />

          <span className="text-sm text-gray-700">
            Li, entendi e autorizo o compartilhamento temporário dos dados que eu selecionar.
          </span>
        </label>

        <button
          onClick={saveConsent}
          disabled={loading || !accepted}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Registrando...
            </>
          ) : (
            <>
              <CheckCircle className="w-5 h-5" />
              Assinar Consentimento
            </>
          )}
        </button>
      </div>

      {savedHash ? (
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
          <p className="text-sm font-semibold text-emerald-800 mb-2">
            Consentimento registrado
          </p>

          <p className="text-xs text-emerald-700 mb-1">Hash SHA-256:</p>
          <p className="text-xs font-mono break-all text-emerald-900">
            {savedHash}
          </p>
        </div>
      ) : null}

      <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-xs text-blue-700">
        Você continua no controle: o compartilhamento só ocorre quando você gera um código/QR e escolhe os dados autorizados.
      </div>
    </div>
  )
}
