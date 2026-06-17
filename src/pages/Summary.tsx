import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { createProfessionalShare } from '@/services/shareAccess'
import { useAuth } from '@/hooks/useAuth'
import { generateHealthSummary } from '@/services/generateHealthSummary'

export default function Summary() {
  const { user } = useAuth()
  const [summary, setSummary] = useState('')
  const [shareCode, setShareCode] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    load()
  }, [user])

  async function load() {
    if (!user) return

    const existing = await supabase
      .from('health_summaries')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing.data?.summary) {
      setSummary(existing.data.summary)
      return
    }

    await generateAndSave()
  }

  async function generateAndSave() {
    if (!user) return

    setLoading(true)

    const profileRaw = localStorage.getItem(`healthwallet_profile_${user.id}`)
    const profile = profileRaw ? JSON.parse(profileRaw) : {}

    const [recordsRes, medsRes, conditionsRes, scoreRes] = await Promise.all([
      supabase.from('medical_records').select('*').eq('user_id', user.id),
      supabase.from('medications').select('*').eq('user_id', user.id),
      supabase.from('patient_conditions').select('*').eq('user_id', user.id),
      supabase
        .from('health_scores')
        .select('*')
        .eq('user_id', user.id)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const text = generateHealthSummary(
      profile,
      recordsRes.data || [],
      medsRes.data || [],
      conditionsRes.data || [],
      scoreRes.data
    )

    const professionalText = `
Resumo profissional:
${text}

Observação: informações compartilhadas pelo paciente via HealthWallet. Este resumo serve como apoio e não substitui avaliação clínica.
`

    await supabase.from('health_summaries').upsert(
      {
        user_id: user.id,
        summary: text,
        professional_summary: professionalText,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    setSummary(text)
    setLoading(false)
  }

  async function handleShare() {
    if (!user) return

    const share = await createProfessionalShare(user.id)
    setShareCode(share.access_code)
  }

  async function copyCode() {
    if (!shareCode) return
    await navigator.clipboard.writeText(shareCode)
    alert('Código copiado!')
  }

  return (
    <div className="p-4 pb-20">
      <h1 className="text-2xl font-bold mb-4">
        Meu Resumo de Saúde
      </h1>

      <div className="bg-white rounded-xl border p-4">
        <pre className="whitespace-pre-wrap text-sm">
          {loading ? 'Gerando resumo...' : summary || 'Nenhum resumo disponível'}
        </pre>

        <button
          onClick={generateAndSave}
          className="mt-4 w-full bg-blue-600 text-white py-3 rounded-xl font-medium"
        >
          Atualizar Resumo
        </button>

        <button
          onClick={handleShare}
          className="mt-3 w-full bg-emerald-600 text-white py-3 rounded-xl font-medium"
        >
          Compartilhar com Profissional
        </button>

        {shareCode && (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="text-sm text-emerald-700 mb-1">
              Código gerado:
            </p>

            <p className="text-3xl font-bold tracking-widest text-emerald-900">
              {shareCode}
            </p>

            <button
              onClick={copyCode}
              className="mt-3 w-full bg-white border border-emerald-300 text-emerald-700 py-2 rounded-xl font-medium"
            >
              Copiar código
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
