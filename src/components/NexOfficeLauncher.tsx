import { useState } from 'react'
import { Building2, ExternalLink, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

function messageFor(status: number, code: string) {
  if (status === 401 || code === 'unauthorized') return 'Sua sessão expirou. Entre novamente e tente de novo.'
  if (status === 403 || code === 'mydatamed_subscription_required') return 'NexOffice está incluído para assinantes MyDataMed ativos.'
  if (status === 503 || code === 'nexoffice_disabled' || code === 'nexoffice_not_configured') return 'NexOffice ainda não está habilitado neste ambiente.'
  return 'NexOffice está temporariamente indisponível. O MyDataMed continua funcionando normalmente.'
}

export default function NexOfficeLauncher() {
  const { session } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const enabled = import.meta.env.VITE_NEXOFFICE_ENABLED === 'true'

  if (!enabled || !session?.access_token) return null

  async function openNexOffice() {
    if (busy) return
    setBusy(true)
    setError('')

    try {
      const response = await fetch('/api/nexoffice/handoff', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${session.access_token}`,
          'content-type': 'application/json',
        },
        body: '{}',
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.url) {
        throw Object.assign(new Error(String(payload?.error || 'nexoffice_unavailable')), {
          status: response.status,
          code: payload?.error,
        })
      }

      window.location.assign(String(payload.url))
    } catch (cause: any) {
      setError(messageFor(Number(cause?.status || 0), String(cause?.code || cause?.message || '')))
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      {error ? (
        <div className="absolute right-0 top-12 z-50 w-72 rounded-xl border border-amber-200 bg-white p-3 text-xs text-slate-700 shadow-xl">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={openNexOffice}
        disabled={busy}
        className="flex items-center gap-2 rounded-xl border border-indigo-300/30 bg-indigo-500/15 px-3 py-2 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-500/25 disabled:cursor-wait disabled:opacity-70"
        title="NexOffice incluído no seu plano MyDataMed"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
        <span>{busy ? 'Abrindo…' : 'NexOffice'}</span>
        {!busy ? <ExternalLink className="h-3 w-3 opacity-70" /> : null}
      </button>
    </div>
  )
}
