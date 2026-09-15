import fs from 'node:fs'
import path from 'node:path'

const appPath = path.join(process.cwd(), 'src', 'App.tsx')
let source = fs.readFileSync(appPath, 'utf8')

if (!source.includes("import { App as CapacitorApp } from '@capacitor/app'")) {
  source = source.replace(
    "import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'",
    "import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'\nimport { App as CapacitorApp } from '@capacitor/app'",
  )
}

const directImport = `import {
  checkDirectAndroidHealthPermissions,
  isDirectAndroidHealthAvailable,
  openDirectAndroidStepsPermission,
  requestDirectAndroidHealthPermissions,
  syncDirectAndroidHealth,
} from './services/directAndroidHealth'`

if (!source.includes("from './services/directAndroidHealth'")) {
  source = source.replace(
    "import { supabase } from './lib/supabase'",
    `import { supabase } from './lib/supabase'\n${directImport}`,
  )
} else {
  source = source.replace(
    /import \{[^}]*\} from '\.\/services\/directAndroidHealth'/s,
    directImport,
  )
}

source = source.replace(/\n\s*probeHealthAccess,/, '')

if (!source.includes('const directPermissionPending = useRef(false)')) {
  source = source.replace(
    '  const consumedHandoffKey = useRef<string | null>(null)',
    '  const consumedHandoffKey = useRef<string | null>(null)\n  const directPermissionPending = useRef(false)',
  )
}

// The full Connect profile should stay intact on Android. Health Connect itself
// lets the citizen grant all or only some categories in one system screen.
source = source.replace(
  /setSelected\(isDirectAndroidHealthAvailable\(\) \? \['steps'\] : incoming\.metrics\)/g,
  'setSelected(incoming.metrics)',
)
source = source.replace(
  /setSelected\(isDirectAndroidHealthAvailable\(\) \? \['steps'\] : redeemed\.metrics\)/g,
  'setSelected(redeemed.metrics)',
)

source = source.replace(
  '    void runHandoffSync(handoff, userId)',
  `    if (isDirectAndroidHealthAvailable()) {
      void runDirectAndroidHealthHandoff(handoff, userId)
    } else {
      void runHandoffSync(handoff, userId)
    }`,
)

const providerNameMarker = '  const providerName = useMemo(() => providerLabel(availability?.provider || null), [availability])'
if (!source.includes("CapacitorApp.addListener('appStateChange'")) {
  const resumeEffect = `  useEffect(() => {
    if (!userId || !isDirectAndroidHealthAvailable()) return
    let listener: { remove: () => Promise<void> } | undefined

    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive || !directPermissionPending.current) return
      void resumeDirectAndroidHealthPermission()
    }).then((handle) => {
      listener = handle
    })

    return () => {
      void listener?.remove()
    }
  }, [userId, handoff, selected])

`
  source = source.replace(providerNameMarker, `${resumeEffect}${providerNameMarker}`)
}

const runHandoffMarker = '  async function runHandoffSync(activeHandoff: ConnectHandoff, activeUserId: string) {'
if (!source.includes('async function runDirectAndroidHealthHandoff(')) {
  const directFunctions = `  async function finishDirectAndroidHealthSync(
    activeUserId: string,
    activeHandoff: ConnectHandoff | null,
    requestedMetrics: HealthMetric[],
  ) {
    try {
      setBusy(true)
      setHandoffError('')
      setMessage('Permissões confirmadas. Sincronizando os dados autorizados…')
      const result = await syncDirectAndroidHealth(activeUserId, requestedMetrics, activeHandoff?.days || 30)
      const now = new Date()
      setLastSync(now.toLocaleString())
      setPermissionRecovery(false)
      directPermissionPending.current = false

      const skipped = Array.isArray(result.skippedMetrics) ? result.skippedMetrics.length : 0
      const suffix = result.degraded
        ? ' Passos foram sincronizados; os demais dados serão tentados novamente na próxima sincronização.'
        : skipped > 0
          ? \` \${skipped} categoria(s) não autorizada(s) foram respeitadas.\`
          : ''
      setMessage(\`\${result.daysSynced} dia(s) sincronizado(s).\${suffix} Voltando para sua HealthWallet…\`)

      if (activeHandoff) {
        await delay(500)
        await returnToHealthWallet(activeHandoff, {
          status: 'success',
          provider: result.provider,
          daysSynced: result.daysSynced,
        })
      }
    } catch (error: any) {
      const text = error?.message === 'NO_HEALTH_PERMISSIONS_GRANTED'
        ? 'Nenhum dado de saúde foi autorizado. Você pode tentar novamente e escolher o que deseja compartilhar.'
        : error?.message || 'Não foi possível sincronizar os dados pelo Android.'
      setMessage(text)
      setHandoffError(text)
      setPermissionRecovery(true)
    } finally {
      setBusy(false)
    }
  }

  async function launchDirectHealthPermission() {
    directPermissionPending.current = true
    setPermissionRecovery(false)
    setMessage('O Android vai mostrar uma única tela do Health Connect. Autorize todos os dados que quiser compartilhar; depois a sincronização continua sozinha.')

    try {
      await requestDirectAndroidHealthPermissions()
    } catch (requestError) {
      console.warn('Official Health Connect permission sheet unavailable, using settings fallback:', requestError)
      setPermissionRecovery(true)
      setMessage('Não foi possível abrir a tela oficial automaticamente. Abrindo a página de permissões do Health Connect como alternativa…')
      await openDirectAndroidStepsPermission()
    }
  }

  async function runDirectAndroidHealthHandoff(activeHandoff: ConnectHandoff | null, activeUserId: string) {
    try {
      const requestedMetrics = activeHandoff?.metrics?.length ? activeHandoff.metrics : selected
      if (!requestedMetrics.length) {
        throw new Error('Selecione pelo menos um dado de saúde para sincronizar.')
      }

      setHandoffError('')
      setMessage('Verificando suas autorizações no Health Connect…')
      const permission = await checkDirectAndroidHealthPermissions(requestedMetrics)

      if (permission.missingMetrics.length > 0) {
        await launchDirectHealthPermission()
        return
      }

      await finishDirectAndroidHealthSync(activeUserId, activeHandoff, requestedMetrics)
    } catch (error: any) {
      directPermissionPending.current = false
      const text = error?.message || 'Não foi possível abrir ou verificar as permissões de saúde.'
      setMessage(text)
      setHandoffError(text)
      setPermissionRecovery(true)
      setBusy(false)
    }
  }

  async function resumeDirectAndroidHealthPermission() {
    if (!userId || !directPermissionPending.current) return
    try {
      const requestedMetrics = handoff?.metrics?.length ? handoff.metrics : selected
      const permission = await checkDirectAndroidHealthPermissions(requestedMetrics)

      if (!permission.grantedMetrics.length) {
        setPermissionRecovery(true)
        setMessage('Nenhum dado foi autorizado ainda. Toque em “Autorizar dados de saúde” para tentar novamente.')
        return
      }

      directPermissionPending.current = false
      await finishDirectAndroidHealthSync(userId, handoff, requestedMetrics)
    } catch (error: any) {
      directPermissionPending.current = false
      const text = error?.message || 'Não foi possível confirmar as permissões ao retornar ao Connect.'
      setMessage(text)
      setHandoffError(text)
      setPermissionRecovery(true)
    }
  }

`
  source = source.replace(runHandoffMarker, `${directFunctions}${runHandoffMarker}`)
}

const authorizeStart = source.indexOf('  async function authorize() {')
const directRunStart = source.indexOf('\n  async function runDirectAndroidHealthHandoff(', authorizeStart)
if (authorizeStart !== -1 && directRunStart !== -1) {
  const originalAuthorizeBlock = source.slice(authorizeStart, directRunStart)
  const directAwareAuthorize = originalAuthorizeBlock.replace(
    "  async function authorize() {\n    try {",
    `  async function authorize() {
    if (isDirectAndroidHealthAvailable() && userId) {
      await runDirectAndroidHealthHandoff(handoff, userId)
      return
    }
    try {`,
  )
  source = source.slice(0, authorizeStart) + directAwareAuthorize + source.slice(directRunStart)
}

const syncStart = source.indexOf('  async function sync() {')
const openDirectStart = source.indexOf('\n  async function openDirectPermissions()', syncStart)
if (syncStart !== -1 && openDirectStart !== -1) {
  const originalSyncBlock = source.slice(syncStart, openDirectStart)
  const directAwareSync = originalSyncBlock.replace(
    "  async function sync() {\n    if (!userId) return",
    `  async function sync() {
    if (!userId) return
    if (isDirectAndroidHealthAvailable()) {
      await runDirectAndroidHealthHandoff(handoff, userId)
      return
    }`,
  )
  source = source.slice(0, syncStart) + directAwareSync + source.slice(openDirectStart)
}

const openDirectStart2 = source.indexOf('  async function openDirectPermissions() {')
const continueStart = source.indexOf('\n  async function continueAfterManualPermission()', openDirectStart2)
if (openDirectStart2 !== -1 && continueStart !== -1) {
  const replacement = `  async function openDirectPermissions() {
    if (isDirectAndroidHealthAvailable()) {
      try {
        await launchDirectHealthPermission()
      } catch (error: any) {
        directPermissionPending.current = false
        setMessage(error?.message || 'Não foi possível abrir as permissões do Health Connect.')
      }
      return
    }

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
`
  source = source.slice(0, openDirectStart2) + replacement + source.slice(continueStart)
}

const start = source.indexOf('  async function continueAfterManualPermission() {')
const end = source.indexOf('\n  function backToHealthWallet()', start)
if (start === -1 || end === -1) throw new Error('Could not locate continueAfterManualPermission in App.tsx')

const replacement = `  async function continueAfterManualPermission() {
    if (!userId) return
    await runDirectAndroidHealthHandoff(handoff, userId)
  }
`
source = source.slice(0, start) + replacement + source.slice(end)

source = source.replace(/Já autorizei\s*—\s*[^<\n]+/, 'Já autorizei — continuar sincronização')
source = source.replace(/Abrir permissões diretamente/g, 'Autorizar dados de saúde')
source = source.replace(
  /No Android, o Connect pede Passos pela tela oficial do Health Connect\.[^<\n]+|No Android, o Connect verifica Passos diretamente\.[^<\n]+|Depois de autorizar no Health Connect,[^<\n]+|Se você já recusou permissões várias vezes,[^<\n]+/,
  'No Android, o Connect abre a tela oficial do Health Connect com todas as categorias disponíveis de uma vez. Você escolhe o que autorizar e, ao voltar, a sincronização continua automaticamente.',
)
source = source.replace(
  'Depois de autorizar no Health Connect, volte aqui e use “Já autorizei — sincronizar agora”.',
  'Normalmente basta autorizar na tela do Android. Ao voltar, a sincronização continua sozinha.',
)

if (!source.includes('runDirectAndroidHealthHandoff')) {
  throw new Error('Could not install automatic full Android handoff flow.')
}
if (!source.includes("CapacitorApp.addListener('appStateChange'")) {
  throw new Error('Could not install Android permission resume listener.')
}
if (!source.includes('requestDirectAndroidHealthPermissions')) {
  throw new Error('Could not install official full Health Connect permission request.')
}
if (!source.includes('syncDirectAndroidHealth')) {
  throw new Error('Could not install full Android health synchronization.')
}

fs.writeFileSync(appPath, source)
console.log('Android Connect now opens the platform Health Connect permission sheet for the full read-only profile, respects partial grants, syncs automatically on return, and keeps Settings only as fallback.')
