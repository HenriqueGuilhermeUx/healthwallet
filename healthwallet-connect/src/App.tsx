import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Activity, Check, ChevronRight, HeartPulse, LogOut, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react'
import { supabase } from './lib/supabase'
import {
  getHealthAvailability,
  HealthMetric,
  METRICS,
  providerLabel,
  requestHealthAccess,
  syncHealthData,
} from './services/healthSync'

type Availability = Awaited<ReturnType<typeof getHealthAvailability>>

export default function App() {
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [selected, setSelected] = useState<HealthMetric[]>(['steps'])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id || null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id || null)
    })
    getHealthAvailability().then(setAvailability)
    return () => listener.subscription.unsubscribe()
  }, [])

  const providerName = useMemo(() => providerLabel(availability?.provider || null), [availability])

  async function login(event: FormEvent) {
    event.preventDefault()
    setAuthBusy(true)
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
    setAuthBusy(false)
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  function toggleMetric(metric: HealthMetric) {
    setSelected((current) => current.includes(metric)
      ? current.filter((item) => item !== metric)
      : [...current, metric])
  }

  async function authorize() {
    try {
      setBusy(true)
      setMessage('Solicitando as permissões que você selecionou…')
      await requestHealthAccess(selected)
      setMessage('Permissões atualizadas. Você pode sincronizar agora.')
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível atualizar as permissões.')
    } finally {
      setBusy(false)
    }
  }

  async function sync() {
    if (!userId) return
    try {
      setBusy(true)
      setMessage('Lendo seus dados autorizados e atualizando sua HealthWallet…')
      const result = await syncHealthData(userId, selected, 30)
      const now = new Date()
      setLastSync(now.toLocaleString())
      setMessage(`${result.daysSynced} dia(s) sincronizado(s) com sua HealthWallet.`)
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível sincronizar agora.')
    } finally {
      setBusy(false)
    }
  }

  if (!userId) {
    return (
      <main className="shell auth-shell">
        <section className="card auth-card">
          <div className="brand-mark"><HeartPulse size={28} /></div>
          <p className="eyebrow">HealthWallet</p>
          <h1>Connect</h1>
          <p className="lead">Conecte seus dados de saúde à sua carteira, sempre sob seu controle.</p>
          <form onSubmit={login} className="form-stack">
            <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            {authError && <p className="error">{authError}</p>}
            <button className="primary" disabled={authBusy}>{authBusy ? 'Entrando…' : 'Entrar com minha HealthWallet'}</button>
          </form>
          <p className="fine-print">Use a mesma conta do HealthWallet. O Connect não vende dados e não realiza diagnóstico.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">HealthWallet</p>
          <h1>Connect</h1>
        </div>
        <button className="icon-button" onClick={logout} aria-label="Sair"><LogOut size={20} /></button>
      </header>

      <section className="hero card">
        <div className="hero-icon"><Smartphone size={30} /></div>
        <div>
          <p className="eyebrow">Fonte detectada</p>
          <h2>{providerName}</h2>
          <p>{availability?.available ? 'Pronto para conectar.' : availability?.reason || 'Verificando disponibilidade…'}</p>
        </div>
        <span className={availability?.available ? 'status ok' : 'status'}>{availability?.available ? 'Disponível' : 'Atenção'}</span>
      </section>

      <section className="section-head">
        <div>
          <p className="eyebrow">Você decide</p>
          <h2>Dados para sincronizar</h2>
        </div>
        <ShieldCheck size={24} />
      </section>

      <section className="metric-grid">
        {METRICS.map((metric) => {
          const active = selected.includes(metric.id)
          return (
            <button key={metric.id} className={`metric-card ${active ? 'selected' : ''}`} onClick={() => toggleMetric(metric.id)}>
              <div className="metric-top">
                <Activity size={20} />
                <span className="check">{active ? <Check size={16} /> : null}</span>
              </div>
              <strong>{metric.label}</strong>
              <small>{metric.description}</small>
            </button>
          )
        })}
      </section>

      <section className="card privacy-card">
        <ShieldCheck size={24} />
        <div>
          <strong>Controle permanece com você</strong>
          <p>O Connect solicita apenas as categorias selecionadas. Você pode alterar ou revogar permissões no sistema a qualquer momento.</p>
        </div>
      </section>

      <section className="actions">
        <button className="secondary" onClick={authorize} disabled={busy || selected.length === 0}>
          Gerenciar permissões <ChevronRight size={18} />
        </button>
        <button className="primary" onClick={sync} disabled={busy || selected.length === 0 || !availability?.available}>
          {busy ? <RefreshCw className="spin" size={18} /> : <RefreshCw size={18} />}
          Sincronizar com minha HealthWallet
        </button>
      </section>

      {(message || lastSync) && (
        <section className="card sync-card">
          <strong>{message || 'Sincronização concluída.'}</strong>
          {lastSync && <small>Última sincronização nesta sessão: {lastSync}</small>}
        </section>
      )}

      <p className="fine-print footer-note">Dados de dispositivos são complementares e não substituem avaliação de profissional de saúde.</p>
    </main>
  )
}
