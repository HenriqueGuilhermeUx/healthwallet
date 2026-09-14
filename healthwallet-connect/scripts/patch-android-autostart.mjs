import fs from 'node:fs'
import path from 'node:path'

const appPath = path.join(process.cwd(), 'src', 'App.tsx')
let source = fs.readFileSync(appPath, 'utf8')

const legacyGate = '    if (!handoff?.autostart || handoffBusy || handoffError || !userId || !availability?.available) return'
const nativeGate = `    if (!handoff?.autostart || handoffBusy || handoffError || !userId) return
    if (!isDirectAndroidHealthAvailable() && !availability?.available) return`

if (source.includes(legacyGate)) {
  source = source.replace(legacyGate, nativeGate)
}

if (!source.includes(nativeGate)) {
  throw new Error('Could not install Android-native autostart gate in App.tsx')
}

if (source.includes(legacyGate)) {
  throw new Error('Legacy Capgo availability gate still blocks Android autostart')
}

if (!source.includes('void runDirectAndroidHealthHandoff(handoff, userId)')) {
  throw new Error('Direct Android handoff is not wired into autostart effect')
}

fs.writeFileSync(appPath, source)
console.log('Android handoff autostart no longer waits for legacy Capgo availability. Native permission/sync flow starts immediately when the secure handoff is ready.')
