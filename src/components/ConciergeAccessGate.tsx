import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getConciergeMembershipForPatient } from '@/services/conciergeConsent'

type Props = { children: React.ReactNode }

export default function ConciergeAccessGate({ children }: Props) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [membership, setMembership] = useState<any>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setUnavailable(false)
      try {
        const data = await getConciergeMembershipForPatient(user!.id)
        if (!cancelled) setMembership(data)
      } catch (error) {
        console.warn('Concierge enrollment gate unavailable:', error)
        if (!cancelled) setUnavailable(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [user?.id])

  if (loading) {
    return <div className="min-h-[55vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
  }

  if (unavailable) {
    return (
      <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5 text-blue-950">
        <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /><p className="font-bold">HealthWallet Concierge</p></div>
        <p className="mt-3 text-sm leading-relaxed">O motor do Concierge ainda não foi ativado neste ambiente. O restante da HealthWallet continua funcionando normalmente.</p>
      </section>
    )
  }

  if (!membership || !['pilot', 'active', 'paused'].includes(membership.status)) {
    return (
      <section className="rounded-3xl border bg-white p-6 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-emerald-700" />
        <h1 className="mt-3 text-xl font-bold">HealthWallet Concierge</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">O Concierge está em piloto controlado. Quando sua conta for incluída, você poderá ativar o acompanhamento sem criar outro cadastro.</p>
      </section>
    )
  }

  if (membership.consent_status !== 'accepted') {
    return <Navigate to="/concierge/consent" replace />
  }

  return <>{children}</>
}
