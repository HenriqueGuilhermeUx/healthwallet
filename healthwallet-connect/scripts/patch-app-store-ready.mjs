import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const appPath = path.join(root, 'src', 'App.tsx')
const stylesPath = path.join(root, 'src', 'styles.css')

function fail(message) {
  console.error(`Store-ready patch failed: ${message}`)
  process.exit(1)
}

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source
  if (!source.includes(search)) fail(`missing marker: ${label}`)
  return source.replace(search, replacement)
}

let app = fs.readFileSync(appPath, 'utf8')

app = replaceOnce(
  app,
  "type Availability = Awaited<ReturnType<typeof getHealthAvailability>>\n",
  "type Availability = Awaited<ReturnType<typeof getHealthAvailability>>\n\nconst CONNECT_PRIVACY_URL = 'https://healthwallet1.netlify.app/privacy'\nconst LAST_SYNC_KEY = 'healthwallet_connect_last_sync'\n",
  'availability type',
)

app = replaceOnce(
  app,
  "  const [lastSync, setLastSync] = useState<string | null>(null)",
  "  const [lastSync, setLastSync] = useState<string | null>(() => window.localStorage.getItem(LAST_SYNC_KEY))",
  'lastSync state',
)

app = app.replaceAll(
  "      setLastSync(now.toLocaleString())",
  "      const formattedSync = now.toLocaleString()\n      setLastSync(formattedSync)\n      window.localStorage.setItem(LAST_SYNC_KEY, formattedSync)",
)

app = replaceOnce(
  app,
  "          <p className=\"fine-print\">Use a mesma conta do HealthWallet. O Connect não vende dados e não realiza diagnóstico médico.</p>",
  "          <p className=\"fine-print\">Use a mesma conta da HealthWallet. O Connect lê somente os dados que você autorizar, não vende dados e não realiza diagnóstico médico. <a className=\"inline-link\" href={CONNECT_PRIVACY_URL} target=\"_blank\" rel=\"noreferrer\">Política de Privacidade</a>.</p>",
  'login privacy copy',
)

const oldPrivacy = `      <section className="card privacy-card">
        <ShieldCheck size={24} />
        <div>
          <strong>Controle permanece com você</strong>
          <p>O Connect solicita apenas as categorias selecionadas. Você pode alterar ou revogar permissões no sistema a qualquer momento.</p>
        </div>
      </section>`

const newPrivacy = `      <section className="card connection-card">
        <div className="connection-title">
          <span className="connection-badge"><Check size={17} /></span>
          <div>
            <p className="eyebrow">Status do companion</p>
            <h2>Conectado à HealthWallet</h2>
          </div>
        </div>
        <div className="connection-meta">
          <span>Fonte de saúde</span><strong>{providerName}</strong>
          <span>Última sincronização</span><strong>{lastSync || 'Ainda não sincronizado neste aparelho'}</strong>
          <span>Categorias selecionadas</span><strong>{selected.length} de {METRICS.length}</strong>
          <span>Modo de acesso</span><strong>Somente leitura</strong>
        </div>
        <p className="fine-print">Depois da autorização inicial, a HealthWallet pode abrir o Connect, sincronizar e retornar automaticamente. Você continua podendo revisar ou revogar permissões no Android.</p>
      </section>

      <section className="card privacy-card">
        <ShieldCheck size={24} />
        <div>
          <strong>Seus dados, sob seu controle</strong>
          <p>O Connect solicita somente as categorias escolhidas e usa esses dados para preencher sua própria HealthWallet e seus resumos de saúde. Não usamos dados de saúde para publicidade, venda de dados, crédito ou decisões automatizadas de tratamento.</p>
          <p>Você pode alterar ou revogar permissões no Health Connect e desconectar esta conta a qualquer momento.</p>
          <a className="inline-link" href={CONNECT_PRIVACY_URL} target="_blank" rel="noreferrer">Ver Política de Privacidade <ExternalLink size={14} /></a>
        </div>
      </section>`

app = replaceOnce(app, oldPrivacy, newPrivacy, 'privacy card')

const oldActions = `        <button className="secondary" onClick={authorize} disabled={busy || selected.length === 0}>
          Gerenciar permissões <ChevronRight size={18} />
        </button>
        <button className="primary" onClick={sync} disabled={busy || selected.length === 0}>`

const newActions = `        <button className="secondary" onClick={authorize} disabled={busy || selected.length === 0}>
          Autorizar dados selecionados <ChevronRight size={18} />
        </button>
        <button className="secondary" type="button" onClick={openDirectPermissions} disabled={busy}>
          Revisar ou revogar no Health Connect <ExternalLink size={18} />
        </button>
        <button className="primary" onClick={sync} disabled={busy || selected.length === 0}>`

app = replaceOnce(app, oldActions, newActions, 'actions')

app = replaceOnce(
  app,
  `        {handoff?.returnTo && (
          <button className="link-button" type="button" onClick={backToHealthWallet}>Voltar sem sincronizar</button>
        )}`,
  `        {handoff?.returnTo && (
          <button className="link-button" type="button" onClick={backToHealthWallet}>Voltar sem sincronizar</button>
        )}
        <button className="link-button danger-link" type="button" onClick={logout} disabled={busy}>
          <LogOut size={16} /> Desconectar esta conta do Connect
        </button>`,
  'disconnect action',
)

app = replaceOnce(
  app,
  "      <p className=\"fine-print footer-note\">Dados de dispositivos são complementares e não substituem avaliação de profissional de saúde.</p>",
  "      <p className=\"fine-print footer-note\">HealthWallet Connect é um app companion da HealthWallet. Os dados de dispositivos são complementares, permanecem sob controle do usuário e não substituem avaliação de profissional de saúde.</p>",
  'footer disclosure',
)

fs.writeFileSync(appPath, app)

let styles = fs.readFileSync(stylesPath, 'utf8')
const styleMarker = '/* HEALTHWALLET_CONNECT_STORE_READY */'
if (!styles.includes(styleMarker)) {
  styles += `

${styleMarker}
.connection-card { margin-top: 18px; padding: 20px; display: grid; gap: 16px; }
.connection-title { display: flex; align-items: center; gap: 12px; }
.connection-badge { width: 36px; height: 36px; border-radius: 999px; display: grid; place-items: center; background: #dcfce7; color: #166534; flex: 0 0 auto; }
.connection-meta { display: grid; grid-template-columns: minmax(130px, .8fr) minmax(0, 1.2fr); gap: 9px 14px; padding: 14px; border-radius: 16px; background: #f8fafc; border: 1px solid #e2e8f0; }
.connection-meta span { color: #64748b; font-size: 13px; }
.connection-meta strong { color: #0f172a; font-size: 13px; text-align: right; overflow-wrap: anywhere; }
.inline-link { display: inline-flex; align-items: center; gap: 5px; color: #0e7490; font-weight: 800; text-decoration: none; }
.inline-link:hover { text-decoration: underline; }
.danger-link { display: inline-flex; align-items: center; justify-content: center; gap: 7px; color: #b91c1c; }
.privacy-card p + p { margin-top: 8px; }
@media (max-width: 560px) {
  .connection-meta { grid-template-columns: 1fr; }
  .connection-meta strong { text-align: left; margin-bottom: 5px; }
}
`
  fs.writeFileSync(stylesPath, styles)
}

console.log('HealthWallet Connect store-ready UI applied.')
