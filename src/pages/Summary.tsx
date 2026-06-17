import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { createProfessionalShare } from '@/services/shareAccess'
import { useAuth } from '@/hooks/useAuth'

export default function Summary() {
  const { user } = useAuth()
  const [summary, setSummary] = useState<any>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data } = await supabase
      .from('health_summaries')
      .select('*')
      .limit(1)
      .single()

    setSummary(data)
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">
        Meu Resumo de Saúde
      </h1>

      <div className="bg-white rounded-xl border p-4">

  <pre className="whitespace-pre-wrap">
    {summary?.summary || 'Nenhum resumo disponível'}
  </pre>

  <button
    onClick={async () => {

      if (!user) return

      const share =
        await createProfessionalShare(user.id)

      alert(
        `Código para o profissional: ${share.access_code}`
      )
    }}
    className="mt-4 w-full bg-emerald-600 text-white py-3 rounded-xl font-medium"
  >
    Compartilhar com Profissional
  </button>

</div>
    </div>
  )
}
