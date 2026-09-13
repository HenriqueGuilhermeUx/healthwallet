import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertTriangle, Bug, Check, ChevronRight, ExternalLink, HeartPulse, LogOut, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react'
import { supabase } from './lib/supabase'
import {
  getHealthAvailability,
  getHealthDiagnostics,
  HealthConnectDiagnostics,
  HealthMetric,
  METRICS,
  openHealthPermissionManager,
  probeHealthAccess,
  providerLabel,
  requestHealthAccess,
  syncHealthData,
} from './services/healthSync'
import {
  ConnectHandoff,
  getInitialHandoff,
  redeemHandoff,
  returnToHealthWallet,
  subscribeToHandoffs,
} from './services/handoff'

type Availability = Awaited<ReturnType<typeof getHealthAvailability>>

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: number | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = window.setTimeout(() => resolve(fallback), ms)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) window.clearTimeout(timer)
  })
}

function withRejectingTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: number | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) window.clearTimeout(timer)
  })
}

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
  const [handoff, setHandoff] = useState<ConnectHandoff | null>(null)
  const [handoffBusy, setHandoffBusy] = useState(false)
  const [handoffError, setHandoffError] = useState('')
  const [diagnostics, setDiagnostics] = useState<HealthConnectDiagnostics | null>(null)
  const [permissionRecovery, setPermissionRecovery] = useState(false)
  const autoRunKey = useRef<string | null>(null)
  const consumedHandoffKey = useRef<string | null>(null)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id || null)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user.id || null)
    })

    const provider = providerLabel(null)
    withTimeout(
      getHealthAvailability(),
      5000,
      {
        available: false,
        provider: null,
        reason: `${provider} demorou para responder. Você pode tentar novamente em instantes.`,
      },
    ).then((result) => {
      if (active) setAvailability(result)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true

    async function consumeIncomingHandoff(incoming: ConnectHandoff) {
      if (!active) return

      const key = incoming.code
        ? `code:${incoming.code}`
        : incoming.state
          ? `state:${incoming.state}`
          : null

      if (key && consumedHandoffKey.current === key) return
      if (key) consumedHandoffKey.current = key

      setHandoff(incoming)
      setSelected(incoming.metrics)
      setHandoffError('')
      setPermissionRecovery(false)
      setDiagnostics(null)

      if (!incoming.code) return

      try {
        setHandoffBusy(true)
        setMessage('Conectando com sua HealthWallet…')
        const redeemed = await redeemHandoff(incoming)
        if (!active) return
        setHandoff(redeemed)
        setSelected(redeemed.metrics)
        setMessage('Conta reconhecida. Preparando a sincronização…')
      } catch (error: any) {
        if (!active) return
        const text = error?.message || 'Não foi possível validar a conexão segura.'
        setHandoffError(text)
        setMessage(text)
      } finally {
        if (active) setHandoffBusy(false)
      }
    }

    getInitialHandoff().then((incoming) => {
      if (incoming) void consumeIncomingHandoff(incoming)
    })

    const unsubscribe = subscribeToHandoffs((incoming) => {
      void consumeIncomingHandoff(incoming)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!handoff?.autostart || handoffBusy || handoffError || !userId || !availability?.available) return

    const key = `${handoff.state || 'no-state'}:${userId}:${handoff.profile}:${handoff.metrics.join(',')}:${handoff.days}`
    if (autoRunKey.current === key) return
    autoRunKey.current = key

    void runHandoffSync(handoff, userId)
  }, [handoff, handoffBusy, handoffError, userId, availability])

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

  async function refreshAvailability() {
    setMessage('Verificando a fonte de saúde deste aparelho…')
    const provider = providerLabel(null)
    const result = await withTimeout(
      getHealthAvailability(),
      5000,
      {
        available: false,
        provider: null,
        reason: `${provider} demorou para responder.`,
      },
    )
    setAvailability(result)
    setMessage(result.available ? 'Fonte de saúde disponível.' : result.reason || 'Fonte de saúde indisponível.')
  }

  async function captureDiagnostics(metrics: HealthMetric[]) {
    try {
      setMessage('Diagnóstico 1/3: verificando Health Connect e Manifest…')
      const result = await withRejectingTimeout(
        getHealthDiagnostics(metrics),
        5000,
        'O diagnóstico nativo do Health Connect não respondeu em 5 segundos.',
      )
      setDiagnostics(result)
      return result
    } catch (error: any) {
      const fallback = { error: error?.message || 'Falha ao executar o diagnóstico nativo.' }
      setDiagnostics(fallback)
      return fallback
    }
  }

  async function requestPermissionWithDiagnostics(metrics: HealthMetric[]) {
    const diagnostic = await captureDiagnostics(metrics)
    if (diagnostic.healthConnectSdkStatusLabel && diagnostic.healthConnectSdkStatusLabel !== 'available') {
      throw new Error(`Health Connect não está disponível: ${diagnostic.healthConnectSdkStatusLabel}.`)
    }
    if (diagnostic.allRequestedPermissionsDeclared === false) {
      throw new Error('O APK não declarou todas as permissões selecionadas no Manifest.')
    }
    if (diagnostic.permissionIntentResolvable === false) {
      setPermissionRecovery(true)
      throw new Error('O Android não encontrou uma Activity capaz de abrir o pedido de permissões do Health Connect.')
    }

    setMessage('Diagnóstico 2/3: abrindo a tela nativa de permissões…')
    try {
      return await withRejectingTimeout(
        requestHealthAccess(metrics),
        9000,
        'O pedido nativo de permissão foi enviado, mas o Android não devolveu resposta em 9 segundos.',
      )
    } catch (error) {
      setPermissionRecovery(true)
      throw error
    }
  }

  async function authorize() {
    try {
      setBusy(true)
      setPermissionRecovery(false)
      setHandoffError('')
      await requestPermissionWithDiagnostics(selected)
      setMessage('Diagnóstico 3/3: a tela nativa respondeu. Permissões atualizadas.')
      await refreshAvailability()
    } catch (error: any) {
      const text = error?.message || 'Não foi possível atualizar as permissões.'
      setMessage(text)
      setHandoffError(text)
    } finally {
      setBusy(false)
    }
  }

  async function runHandoffSync(activeHandoff: ConnectHandoff, activeUserId: string) {
    try {
      setBusy(true)
      setPermissionRecovery(false)
      setHandoffError('')
      await requestPermissionWithDiagnostics(activeHandoff.metrics)
      setMessage('Permissão respondida. Lendo os dados autorizados…')
      const result = await syncHealthData(activeUserId, activeHandoff.metrics, activeHandoff.days, { skipAuthorization: true })
      const now = new Date()
      setLastSync(now.toLocaleString())
      setMessage(`${result.daysSynced} dia(s) sincronizado(s). Voltando para sua HealthWallet…`)
      await delay(500)
      await returnToHealthWallet(activeHandoff, {
        status: 'success',
        provider: result.provider,
        daysSynced: result.daysSynced,
      })
    } catch (error: any) {
      const text = error?.message || 'Não foi possível sincronizar agora.'
      setMessage(text)
      setHandoffError(text)
      autoRunKey.current = null
    } finally {
      setBusy(false)
    }
  }

  async function sync() {
    if (!userId) return
    try {
      setBusy(true)
      setPermissionRecovery(false)
      setHandoffError('')
      await requestPermissionWithDiagnostics(selected)
      setMessage('Lendo seus dados autorizados e atualizando sua HealthWallet…')
      const result = await syncHealthData(userId, selected, handoff?.days || 30, { skipAuthorization: true })
      const now = new Date()
      setLastSync(now.toLocaleString())
      setMessage(`${result.daysSynced} dia(s) sincronizado(s) com sua HealthWallet.`)

      if (handoff) {
        await delay(400)
        await returnToHealthWallet(handoff, {
          status: 'success',
          provider: result.provider,
          daysSynced: result.daysSynced,
        })
      }
    } catch (error: any) {
      const text = error?.message || 'Não foi possível sincronizar agora.'
      setMessage(text)
      setHandoffError(text)
    } finally {
      setBusy(false)
    }
  }

  async function openDirectPermissions() {
    try {
      setBusy(true)
      await captureDiagnostics(selected)
      const result = await openHealthPermissionManager()
      setMessage(result.route === 'app_health_permissions'
        ? 'Permissões do Health Connect abertas diretamente. Autorize os dados e volte ao Connect.'
        : 'Configurações do Health Connect abertas. Entre em Permissões do app, autorize o Connect e volte.')
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível abrir o Health Connect diretamente.')
    } finally {
      setBusy(false)
    }
  }

  async function continueAfterManualPermission() {
    if (!userId || selected.length === 0) return
    try {
      setBusy(true)
      setHandoffError('')
      setMessage(`Testando leitura direta de ${METRICS.find((metric) => metric.id === selected[0])?.label || selected[0]}…`)
      await withRejectingTimeout(
        probeHealthAccess(selected[0]),
        9000,
        'O Health Connect também não respondeu à leitura direta em 9 segundos.',
      )
      setMessage('Leitura direta respondeu. Sincronizando sem reabrir o pedido de permissão…')
      const result = await syncHealthData(userId, selected, handoff?.days || 30, { skipAuthorization: true })
      const now = new Date()
      setLastSync(now.toLocaleString())
      setPermissionRecovery(false)
      setMessage(`${result.daysSynced} dia(s) sincronizado(s) com sua HealthWallet.`)

      if (handoff) {
        await delay(400)
        await returnToHealthWallet(handoff, {
          status: 'success',
          provider: result.provider,
          daysSynced: result.daysSynced,
        })
      }
    } catch (error: any) {
      const text = error?.message || 'A leitura direta ainda não foi autorizada.'
      setMessage(text)
      setHandoffError(text)
      setPermissionRecovery(true)
    } finally {
      setBusy(false)
    }
  }

  function backToHealthWallet() {
    if (!handoff) return
    void returnToHealthWallet(handoff, {
      status: handoffError ? 'error' : 'success',
      provider: availability?.provider,
      message: handoffError || undefined,
    })
  }

  if (handoffBusy || (handoff?.autostart && userId && busy)) {
    return (
      <main className="shell auth-shell">
        <section className="card auth-card bridge-card">
          <div className="brand-mark"><RefreshCw className="spin" size={28} /></div>
          <p className="eyebrow">HealthWallet</p>
          <h1>Conectando seus dados</h1>
          <p className="lead">{message || 'Abrindo a conexão segura com seus dados de saúde…'}</p>
          <div className="bridge-steps" aria-label="Etapas da conexão">
            <span className="active">1. Conta</span>
            <span className={userId ? 'active' : ''}>2. Permissão</span>
            <span>3. Sincronização</span>
          </div>
          <p className="fine-print">Se o Android não responder em 9 segundos, o Connect vai sair desta tela e mostrar o diagnóstico.</p>
        </section>
      </main>
    )
  }

  if (!userId) {
    return (
      <main className="shell auth-shell">
        <section className="card auth-card">
          <div className="brand-mark"><HeartPulse size={28} /></div>
          <p className="eyebrow">HealthWallet</p>
          <h1>Connect</h1>
          <p className="lead">
            {handoffError
              ? 'A conexão automática não pôde ser concluída. Entre com a mesma conta da HealthWallet para continuar.'
              : 'Conecte seus dados de saúde à sua carteira, sempre sob seu controle.'}
          </p>
          <form onSubmit={login} className="form-stack">
            <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            {(authError || handoffError) && <p className="error">{authError || handoffError}</p>}
            <button className="primary" disabled={authBusy}>{authBusy ? 'Entrando…' : 'Entrar com minha HealthWallet'}</button>
          </form>
          {handoff?.returnTo && (
            <button className="link-button" type="button" onClick={backToHealthWallet}>Voltar para a HealthWallet</button>
          )}
          <p className="fine-print">Use a mesma conta do HealthWallet. O Connect não vende dados e não realiza diagnóstico médico.</p>
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

      {handoff && (
        <section className="card handoff-card">
          <RefreshCw className={busy ? 'spin' : ''} size={22} />
          <div>
            <strong>Conexão iniciada pela HealthWallet</strong>
            <p>{handoffError || 'As escolhas vieram da sua carteira e serão devolvidas automaticamente após a sincronização.'}</p>
          </div>
        </section>
      )}

      {permissionRecovery && (
        <section className="card recovery-card">
          <div className="recovery-title">
            <AlertTriangle size={24} />
            <div>
              <p className="eyebrow">Diagnóstico nativo</p>
              <h2>O Android não concluiu o pedido automático</h2>
            </div>
          </div>
          <p className="recovery-copy">
            Agora o Connect não fica mais preso no spinner. Abaixo estão os sinais que vêm do próprio Android; depois você pode abrir a página de permissões diretamente, autorizar e voltar.
          </p>

          <div className="diagnostic-grid">
            <div><span>Aparelho</span><strong>{diagnostics?.manufacturer || '—'} {diagnostics?.model || ''}</strong></div>
            <div><span>Android SDK</span><strong>{diagnostics?.androidSdk ?? '—'}</strong></div>
            <div><span>Health Connect</span><strong>{diagnostics?.healthConnectSdkStatusLabel || diagnostics?.error || '—'}</strong></div>
            <div><span>Pedido nativo</span><strong>{diagnostics?.permissionIntentResolvable === true ? 'Encontrado' : diagnostics?.permissionIntentResolvable === false ? 'Não encontrado' : '—'}</strong></div>
            <div><span>Tela direta</span><strong>{diagnostics?.managePermissionsIntentResolvable === true ? 'Disponível' : diagnostics?.managePermissionsIntentResolvable === false ? 'Indisponível' : '—'}</strong></div>
            <div><span>Manifest</span><strong>{diagnostics?.allRequestedPermissionsDeclared === true ? 'OK' : diagnostics?.allRequestedPermissionsDeclared === false ? 'Faltando permissão' : '—'}</strong></div>
          </div>

          {diagnostics?.missingManifestPermissions && diagnostics.missingManifestPermissions.length > 0 && (
            <p className="diagnostic-error">Faltando no APK: {diagnostics.missingManifestPermissions.join(', ')}</p>
          )}

          <div className="recovery-actions">
            <button className="primary" type="button" onClick={openDirectPermissions} disabled={busy}>
              <ExternalLink size={18} /> Abrir permissões diretamente
            </button>
            <button className="secondary" type="button" onClick={continueAfterManualPermission} disabled={busy}>
              <Bug size={18} /> Já autorizei — testar leitura e sincronizar
            </button>
          </div>
          <p className="fine-print">Se você já recusou permissões várias vezes, o Android pode deixar de exibir o pedido automático; a tela direta permite revisar e conceder manualmente.</p>
        </section>
      )}

      <section className="hero card">
        <div className="hero-icon"><Smartphone size={30} /></div>
        <div>
          <p className="eyebrow">Fonte detectada</p>
          <h2>{providerName}</h2>
          <p>{availability?.available ? 'Pronto para conectar.' : availability?.reason || 'Verificando disponibilidade…'}</p>
        </div>
        <span className={availability?.available ? 'status ok' : 'status'}>{availability?.available ? 'Disponível' : 'Atenção'}</span>
      </section>

      {!availability?.available && (
        <button className="secondary" type="button" onClick={refreshAvailability} disabled={busy}>
          Verificar Health Connect novamente <ChevronRight size={18} />
        </button>
      )}

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
        {handoff?.returnTo && (
          <button className="link-button" type="button" onClick={backToHealthWallet}>Voltar sem sincronizar</button>
        )}
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
