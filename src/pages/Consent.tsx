import { useEffect, useState } from 'react'
import { ShieldCheck, CheckCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

export default function Consent() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(false)

  const consentText = `
TERMOS DE USO E PRIVACIDADE

Proteção de Dados:
Seus dados são criptografados e armazenados de forma segura, em conformidade com a LGPD.

Controle Total:
Você decide quem acessa seus dados e pode revogar o acesso a qualquer momento.

Uso dos Dados:
Utilizamos inteligência artificial para análise de exames, geração de relatórios personalizados e cálculo do MedScore.

Seus dados nunca são compartilhados sem sua autorização.

Você pode solicitar a exclusão dos seus dados a qualquer momento.

Ao continuar, você concorda com os Termos de Uso e Política de Privacidade do HealthWallet.
`.trim()

  useEffect(() => {
    async function checkAlreadyAccepted() {
      if (!user) return

      const localAccepted = localStorage.getItem(`healthwallet_terms_${user.id}`)

      if (localAccepted === 'true') {
        navigate('/dashboard', { replace: true })
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('accepted_terms')
        .eq('id', user.id)
        .maybeSingle()

      if (data?.accepted_terms) {
        localStorage.setItem(`healthwallet_terms_${user.id}`, 'true')
        navigate('/dashboard', { replace: true })
      }
    }

    checkAlreadyAccepted()
  }, [user, navigate])

  async function saveConsent() {
    if (!user) return

    if (!accepted) {
      toast.error('Você precisa aceitar os termos para continuar')
      return
    }

    setLoading(true)

    try {
      const now = new Date().toISOString()

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          accepted_terms: true,
          accepted_terms_at: now,
        })
        .eq('id', user.id)

      if (updateError) throw updateError

      await supabase.from('health_consents').insert({
        patient_id: user.id,
        consent_type: 'terms_privacy_lgpd',
        consent_text: consentText,
        permissions: {
          profile: true,
          exams: true,
          medications: true,
          allergies: true,
          medscore: true,
          ai_analysis: true,
        },
      })

      localStorage.setItem(`healthwallet_terms_${user.id}`, 'true')
      toast.success('Termos aceitos com sucesso')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar aceite. Verifique se o perfil existe em profiles.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Termos de Uso e Privacidade</h1>
        <p className="text-sm text-muted-foreground">
          Para continuar, aceite os termos de uso, privacidade e proteção de dados.
        </p>
      </div>

      <div className="bg-white rounded-xl border p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
          </div>

          <div>
            <p className="font-semibold">LGPD e proteção dos seus dados</p>
            <p className="text-xs text-gray-500">
              Você controla seus dados e compartilhamentos.
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
            Li e aceito os Termos de Uso e a Política de Privacidade.
          </span>
        </label>

        <button
          onClick={saveConsent}
          disabled={loading || !accepted}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <CheckCircle className="w-5 h-5" />
              Aceitar e Continuar
            </>
          )}
        </button>
      </div>
    </div>
  )
}
