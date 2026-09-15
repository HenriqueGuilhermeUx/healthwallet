import fs from 'node:fs'
import path from 'node:path'

const appPath = path.join(process.cwd(), 'src', 'App.tsx')
if (!fs.existsSync(appPath)) throw new Error('src/App.tsx not found')
let source = fs.readFileSync(appPath, 'utf8')

// Prevent appStateChange + resume from racing and triggering duplicate syncs.
source = source.replace(
  '    if (!userId || !directPermissionPending.current) return\n    try {',
  '    if (!userId || !directPermissionPending.current) return\n    directPermissionPending.current = false\n    try {',
)
source = source.replace(
  "        setPermissionRecovery(true)\n        setMessage('Nenhum dado foi autorizado ainda. Toque em “Autorizar dados de saúde” para tentar novamente.')\n        return",
  "        directPermissionPending.current = true\n        setPermissionRecovery(true)\n        setMessage('Nenhum dado foi autorizado ainda. Toque em “Autorizar dados de saúde” para tentar novamente.')\n        return",
)

if (!source.includes("CapacitorApp.addListener('resume'")) {
  const marker = '  const providerName = useMemo(() => providerLabel(availability?.provider || null), [availability])'
  if (!source.includes(marker)) throw new Error('Could not locate providerName marker in App.tsx')

  const effect = `  useEffect(() => {
    if (!userId || !isDirectAndroidHealthAvailable()) return
    let listener: { remove: () => Promise<void> } | undefined

    void CapacitorApp.addListener('resume', () => {
      if (!directPermissionPending.current) return
      void resumeDirectAndroidHealthPermission()
    }).then((handle) => {
      listener = handle
    })

    return () => {
      void listener?.remove()
    }
  }, [userId, handoff, selected])

`
  source = source.replace(marker, `${effect}${marker}`)
}

// Android native flow must not wait for the legacy Capgo availability probe.
// Once the secure handoff and HealthWallet session are ready, start the native
// permission/sync path immediately. Non-Android platforms keep the old gate.
const legacyAutostartGate = '    if (!handoff?.autostart || handoffBusy || handoffError || !userId || !availability?.available) return'
const nativeAutostartGate = `    if (!handoff?.autostart || handoffBusy || handoffError || !userId) return
    if (!isDirectAndroidHealthAvailable() && !availability?.available) return`
if (source.includes(legacyAutostartGate)) {
  source = source.replace(legacyAutostartGate, nativeAutostartGate)
}

if (!source.includes("CapacitorApp.addListener('resume'")) {
  throw new Error('Could not install Capacitor resume listener')
}
if (!source.includes('directPermissionPending.current = false\n    try {')) {
  throw new Error('Could not install single-flight permission resume guard')
}
if (!source.includes(nativeAutostartGate)) {
  throw new Error('Could not install native Android handoff autostart gate')
}
if (source.includes(legacyAutostartGate)) {
  throw new Error('Legacy Capgo availability gate still blocks Android autostart')
}
if (!source.includes('void runDirectAndroidHealthHandoff(handoff, userId)')) {
  throw new Error('Direct Android handoff is not wired into autostart')
}

fs.writeFileSync(appPath, source)
console.log('Connect resumes permission verification without duplicate syncs and Android handoff now autostarts without waiting for legacy Capgo availability.')
