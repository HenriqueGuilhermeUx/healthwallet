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
  checkDirectAndroidStepsPermission,
  isDirectAndroidHealthAvailable,
  openDirectAndroidStepsPermission,
  requestDirectAndroidStepsPermission,
  syncDirectAndroidSteps,
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

source = source.replace(
  /setSelected\(incoming\.metrics\)/g,
  "setSelected(isDirectAndroidHealthAvailable() ? ['steps'] : incoming.metrics)",
)
source = source.replace(
  /setSelected\(redeemed\.metrics\)/g,
  "setSelected(isDirectAndroidHealthAvailable() ? ['steps'] : redeemed.metrics)",
)

source = source.replace(
  '    void runHandoffSync(handoff, userId)',
  `    if (isDirectAndroidHealthAvailable()) {
      void runDirectAndroidStepsHandoff(handoff, userId)
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
      void resumeDirectAndroidStepsPermission()
    }).then((handle) => {
      listener = handle
    })

    return () => {
      void listener?.remove()
    }
  }, [userId, handoff])

`
  source = source.replace(providerNameMarker, `${resumeEffect}${providerNameMarker}`)
}

const runHandoffMarker = '  async function runHandoffSync(activeHandoff: ConnectHandoff, activeUserId: string) {'
if (!source.includes('async function runDirectAndroidStepsHandoff(')) {
  const directFunctions = `  async function finishDirectAndroidStepsSync(activeUserId: string, activeHandoff: ConnectHandoff | null) {
    try {
      setBusy(true)
      setHandoffError('')
      setMessage('Permissão confirmada. Sincronizando passos diretamente pelo Android…')
      const result = await syncDirectAndroidSteps(activeUserId, activeHandoff?.days || 7)
      const now = new Date()
      setLastSync(now.toLocaleString())
      setPermissionRecovery(false)
      directPermissionPending.current = false
      setMessage(\`\${result.daysSynced} dia(s) de passos sincronizado(s). Voltando para sua HealthWallet…\`)

      if (activeHandoff) {
        await delay(500)
        await returnToHealthWallet(activeHandoff, {
          status: 'success',
          provider: result.provider,
          daysSynced: result.daysSynced,
        })
      }
    } catch (error: any) {
      const text = error?.message === 'READ_STEPS_NOT_GRANTED'
        ? 'A permissão de Passos ainda não foi concedida ao HealthWallet Connect.'
        : error?.message || 'Não foi possível sincronizar os passos pelo Android.'
      setMessage(text)
      setHandoffError(text)
      setPermissionRecovery(true)
    } finally {
      setBusy(false)
    }
  }

  async function launchDirectStepsPermission() {
    directPermissionPending.current = true
    setPermissionRecovery(true)
    setMessage('Autorize Passos na tela do Health Connect. Ao voltar, a sincronização continuará automaticamente.')

    try {
      await requestDirectAndroidStepsPermission()
    } catch (requestError) {
      console.warn('Official Health Connect permission sheet unavailable, using settings fallback:', requestError)
      await openDirectAndroidStepsPermission()
    }
  }

  async function runDirectAndroidStepsHandoff(activeHandoff: ConnectHandoff | null, activeUserId: string) {
    try {
      setHandoffError('')
      setMessage('Verificando a permissão de Passos no Android…')
      const permission = await checkDirectAndroidStepsPermission()
      if (!permission.granted) {
        await launchDirectStepsPermission()
        return
      }
      await finishDirectAndroidStepsSync(activeUserId, activeHandoff)
    } catch (error: any) {
      directPermissionPending.current = false
      const text = error?.message || 'Não foi possível abrir ou verificar a permissão de Passos.'
      setMessage(text)
      setHandoffError(text)
      setPermissionRecovery(true)
      setBusy(false)
    }
  }

  async function resumeDirectAndroidStepsPermission() {
    if (!userId || !directPermissionPending.current) return
    try {
      const permission = await checkDirectAndroidStepsPermission()
      if (!permission.granted) {
        setPermissionRecovery(true)
        setMessage('Passos ainda não está autorizado. Toque em Gerenciar permissões para tentar novamente.')
        return
      }
      directPermissionPending.current = false
      await finishDirectAndroidStepsSync(userId, handoff)
    } catch (error: any) {
      directPermissionPending.current = false
      const text = error?.message || 'Não foi possível confirmar a permissão ao retornar ao Connect.'
      setMessage(text)
      setHandoffError(text)
      setPermissionRecovery(true)
    }
  }

`
  source = source.replace(runHandoffMarker, `${directFunctions}${runHandoffMarker}`)
}

const authorizeStart = source.indexOf('  async function authorize() {')
const runHandoffStart = source.indexOf('\n  async function runDirectAndroidStepsHandoff(', authorizeStart)
if (authorizeStart !== -1 && runHandoffStart !== -1) {
  const originalAuthorizeBlock = source.slice(authorizeStart, runHandoffStart)
  const directAwareAuthorize = originalAuthorizeBlock.replace(
    "  async function authorize() {\n    try {",
    `  async function authorize() {
    if (isDirectAndroidHealthAvailable() && userId) {
      await runDirectAndroidStepsHandoff(handoff, userId)
      return
    }
    try {`,
  )
  source = source.slice(0, authorizeStart) + directAwareAuthorize + source.slice(runHandoffStart)
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
      await runDirectAndroidStepsHandoff(handoff, userId)
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
        await launchDirectStepsPermission()
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
    await runDirectAndroidStepsHandoff(handoff, userId)
  }
`
source = source.slice(0, start) + replacement + source.slice(end)

source = source.replace(/Já autorizei\s*—\s*[^<\n]+/, 'Já autorizei — sincronizar passos direto pelo Android')
source = source.replace(
  /No Android, o Connect verifica Passos diretamente\.[^<\n]+|Depois de autorizar no Health Connect,[^<\n]+|Se você já recusou permissões várias vezes,[^<\n]+/,
  'No Android, o Connect pede Passos pela tela oficial do Health Connect. Se o aparelho não abrir essa tela, usa as configurações como fallback; ao voltar, sincroniza automaticamente.',
)

if (!source.includes('runDirectAndroidStepsHandoff')) {
  throw new Error('Could not install automatic direct Android handoff flow.')
}
if (!source.includes("CapacitorApp.addListener('appStateChange'")) {
  throw new Error('Could not install Android permission resume listener.')
}
if (!source.includes('requestDirectAndroidStepsPermission')) {
  throw new Error('Could not install official Health Connect permission request.')
}
if (!source.includes('openDirectAndroidStepsPermission')) {
  throw new Error('Could not install Health Connect settings fallback.')
}

fs.writeFileSync(appPath, source)
console.log('Android Connect now uses official Health Connect permission request, settings fallback, automatic resume sync, and direct platform reader.')
