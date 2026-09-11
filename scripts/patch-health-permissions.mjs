import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')

// Google Play rejected the previous Health Connect declaration as excessive.
// For this release, Android Health Connect is intentionally limited to READ_STEPS only.
// Other wellness metrics can continue to exist through manual entry and future reviewed releases.
const keepReadPermissions = [
  'android.permission.health.READ_STEPS',
]

const removePermissions = [
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  'android.permission.health.READ_HEART_RATE',
  'android.permission.health.READ_STEPS_CADENCE',
  'android.permission.health.READ_WEIGHT',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_RESTING_HEART_RATE',
  'android.permission.health.READ_OXYGEN_SATURATION',
  'android.permission.health.READ_HEART_RATE_VARIABILITY',
  'android.permission.health.READ_BLOOD_PRESSURE',
  'android.permission.health.READ_EXERCISE',
  'android.permission.health.READ_EXERCISE_SESSION',
  'android.permission.health.WRITE_STEPS',
  'android.permission.health.READ_DISTANCE',
  'android.permission.health.WRITE_DISTANCE',
  'android.permission.health.WRITE_ACTIVE_CALORIES_BURNED',
  'android.permission.health.WRITE_HEART_RATE',
  'android.permission.health.WRITE_WEIGHT',
  'android.permission.health.WRITE_SLEEP',
  'android.permission.health.WRITE_BLOOD_PRESSURE',
]

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function ensureToolsNamespace(content) {
  if (content.includes('xmlns:tools=')) return content
  return content.replace(/<manifest\b([^>]*)>/, '<manifest$1 xmlns:tools="http://schemas.android.com/tools">')
}

function removePermissionDeclarations(content, permission) {
  const regex = new RegExp(`\\n?\\s*<uses-permission\\s+[^>]*android:name=["']${escapeRegex(permission)}["'][^>]*>`, 'g')
  return content.replace(regex, '')
}

function ensurePermission(content, permission, attrs = '') {
  const line = `    <uses-permission android:name="${permission}"${attrs} />`
  const alreadyDeclared = new RegExp(`<uses-permission\\s+[^>]*android:name=["']${escapeRegex(permission)}["'][^>]*>`).test(content)
  if (alreadyDeclared) return content
  return content.replace(/(<manifest[^>]*>)/, `$1\n${line}`)
}

function ensurePermissionRemoval(content, permission) {
  const removalRegex = new RegExp(`<uses-permission\\s+[^>]*android:name=["']${escapeRegex(permission)}["'][^>]*tools:node=["']remove["'][^>]*>`)
  if (removalRegex.test(content)) return content
  return content.replace(/(<manifest[^>]*>)/, `$1\n    <uses-permission android:name="${permission}" tools:node="remove" />`)
}

if (!fs.existsSync(manifestPath)) {
  console.warn('AndroidManifest.xml not found; skipping Health Connect permission trim.')
  process.exit(0)
}

let manifest = fs.readFileSync(manifestPath, 'utf8')
manifest = ensureToolsNamespace(manifest)

for (const permission of removePermissions) {
  manifest = removePermissionDeclarations(manifest, permission)
}

for (const permission of keepReadPermissions) {
  manifest = ensurePermission(manifest, permission)
}

for (const permission of removePermissions) {
  manifest = ensurePermissionRemoval(manifest, permission)
}

fs.writeFileSync(manifestPath, manifest)

console.log('Health Connect permissions trimmed for HealthWallet Play review: READ_STEPS kept; sensitive/unused Health Connect permissions removed from merged manifest.')
