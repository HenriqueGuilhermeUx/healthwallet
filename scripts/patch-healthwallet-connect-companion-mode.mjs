import fs from 'node:fs'
import path from 'node:path'

const filePath = path.join(process.cwd(), 'src', 'pages', 'DeviceData.tsx')
if (!fs.existsSync(filePath)) throw new Error('src/pages/DeviceData.tsx not found')

let source = fs.readFileSync(filePath, 'utf8')

const timeoutHelper = `function withUiTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  }) as Promise<T>
}`

const timeoutHelperWithConnect = `${timeoutHelper}

function isHealthWalletConnectManaged(connection: any) {
  return connection?.provider === 'health_connect'
    && connection?.status !== 'revoked'
    && (
      connection?.metadata?.source_app === 'healthwallet_connect'
      || Boolean(connection?.metadata?.direct_reader)
      || connection?.metadata?.read_strategy === 'android_platform_health_connect_full_native'
    )
}`

if (!source.includes('function isHealthWalletConnectManaged')) {
  if (!source.includes(timeoutHelper)) throw new Error('Could not find withUiTimeout helper')
  source = source.replace(timeoutHelper, timeoutHelperWithConnect)
}

const secondaryMarker = `  async function loadSecondaryData(loadedConnections: any[], allowAutoSync: boolean) {
    if (!user) return
`
const secondaryReplacement = `  async function loadSecondaryData(loadedConnections: any[], allowAutoSync: boolean) {
    if (!user) return

    const connectManaged = loadedConnections.some(isHealthWalletConnectManaged)
`
if (!source.includes('const connectManaged = loadedConnections.some(isHealthWalletConnectManaged)')) {
  if (!source.includes(secondaryMarker)) throw new Error('Could not find loadSecondaryData marker')
  source = source.replace(secondaryMarker, secondaryReplacement)
}

const oldAvailabilityCall = `      withUiTimeout(
        getNativeHealthAvailability(),
        3000,
        'O Health Connect demorou para responder.',
      ),`
const newAvailabilityCall = `      connectManaged
        ? Promise.resolve({
            available: true,
            provider: 'health_connect',
            managedByConnect: true,
            reason: null,
          })
        : withUiTimeout(
            getNativeHealthAvailability(),
            3000,
            'O Health Connect demorou para responder.',
          ),`
if (source.includes(oldAvailabilityCall)) {
  source = source.replace(oldAvailabilityCall, newAvailabilityCall)
}

source = source.replace(
  `    if (allowAutoSync && availability?.available) {
      void autoSyncIfDue(loadedConnections, availability)
    }`,
  `    if (allowAutoSync && availability?.available && !connectManaged) {
      void autoSyncIfDue(loadedConnections, availability)
    }`,
)

const manualBlockEnd = `      load()
      return
    }

    setNativeSyncing(provider)`
const manualBlockEndReplacement = `      load()
      return
    }

    if (provider === 'health_connect' && connections.some(isHealthWalletConnectManaged)) {
      await openAdvancedConnect()
      return
    }

    setNativeSyncing(provider)`
if (!source.includes("provider === 'health_connect' && connections.some(isHealthWalletConnectManaged)")) {
  if (!source.includes(manualBlockEnd)) throw new Error('Could not patch handleConnect companion routing')
  source = source.replace(manualBlockEnd, manualBlockEndReplacement)
}

const syncNowMarker = `  async function syncNow() {
    if (!user) return

    const provider = getNativeProviderForPlatform()`
const syncNowReplacement = `  async function syncNow() {
    if (!user) return

    if (connections.some(isHealthWalletConnectManaged)) {
      await openAdvancedConnect()
      return
    }

    const provider = getNativeProviderForPlatform()`
if (!source.includes('if (connections.some(isHealthWalletConnectManaged))')) {
  if (!source.includes(syncNowMarker)) throw new Error('Could not patch syncNow companion routing')
  source = source.replace(syncNowMarker, syncNowReplacement)
}

const renderMarker = `  const nativeProvider = getNativeProviderForPlatform()
  const nativeProviderLabel = nativeProvider ? getProviderLabel(nativeProvider) : 'app instalado no celular'`
const renderReplacement = `  const nativeProvider = getNativeProviderForPlatform()
  const nativeProviderLabel = nativeProvider ? getProviderLabel(nativeProvider) : 'app instalado no celular'
  const connectConnection = connections.find(isHealthWalletConnectManaged)
  const connectManaged = Boolean(connectConnection)
  const connectLastSync = connectConnection?.last_sync_at
    ? new Date(connectConnection.last_sync_at).toLocaleString('pt-BR')
    : null`
if (!source.includes('const connectConnection = connections.find(isHealthWalletConnectManaged)')) {
  if (!source.includes(renderMarker)) throw new Error('Could not patch Connect render state')
  source = source.replace(renderMarker, renderReplacement)
}

const oldSyncCopy = `            <p className="text-sm text-muted-foreground mt-1">
              Fonte deste aparelho: {nativeProviderLabel}. O app atualiza os dados ao abrir a tela e você pode sincronizar agora.
            </p>
            {!nativeAvailability?.available && (`
const newSyncCopy = `            <p className="text-sm text-muted-foreground mt-1">
              {connectManaged
                ? \`Dados sincronizados pelo HealthWallet Connect\${connectLastSync ? \` · última atualização: \${connectLastSync}\` : ''}. O HealthWallet apenas lê os dados já salvos; as permissões permanecem no Connect.\`
                : \`Fonte deste aparelho: \${nativeProviderLabel}. O app atualiza os dados ao abrir a tela e você pode sincronizar agora.\`}
            </p>
            {!connectManaged && !nativeAvailability?.available && (`
if (source.includes(oldSyncCopy)) {
  source = source.replace(oldSyncCopy, newSyncCopy)
}

const oldMainSyncButton = `          <button
            type="button"
            onClick={syncNow}
            disabled={Boolean(nativeSyncing)}
            className="rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-60"
          >
            {nativeSyncing ? 'Sincronizando...' : 'Sincronizar agora'}
          </button>`
const newMainSyncButton = `          <button
            type="button"
            onClick={connectManaged ? openAdvancedConnect : syncNow}
            disabled={connectManaged ? openingConnect : Boolean(nativeSyncing)}
            className="rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-60"
          >
            {connectManaged
              ? (openingConnect ? 'Abrindo Connect...' : 'Atualizar pelo Connect')
              : (nativeSyncing ? 'Sincronizando...' : 'Sincronizar agora')}
          </button>`
if (source.includes(oldMainSyncButton)) {
  source = source.replace(oldMainSyncButton, newMainSyncButton)
}

source = source.replace(
  `onClick={() => handleConnect(option.provider)}`,
  `onClick={() => option.provider === 'health_connect' && connectManaged ? void openAdvancedConnect() : void handleConnect(option.provider)}`,
)

if (!source.includes('managedByConnect: true')) {
  throw new Error('Companion mode availability bypass was not installed')
}
if (!source.includes('Atualizar pelo Connect')) {
  throw new Error('Companion mode sync button was not installed')
}
if (!source.includes("!connectManaged && !nativeAvailability?.available")) {
  throw new Error('False Health Connect timeout suppression was not installed')
}

fs.writeFileSync(filePath, source)
console.log('HealthWallet companion mode patched: Connect-managed Android data skips duplicate native availability/sync checks, uses Connect for refresh, and suppresses false timeout notices.')
