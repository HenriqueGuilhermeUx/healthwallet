import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')

const keepReadPermissions = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  'android.permission.health.READ_HEART_RATE',
  'android.permission.health.READ_WEIGHT',
]

const removePermissions = [
  'android.permission.health.WRITE_STEPS',
  'android.permission.health.READ_DISTANCE',
  'android.permission.health.WRITE_DISTANCE',
  'android.permission.health.WRITE_ACTIVE_CALORIES_BURNED',
  'android.permission.health.WRITE_HEART_RATE',
  'android.permission.health.WRITE_WEIGHT',
]

function ensureToolsNamespace(content) {
  if (content.includes('xmlns:tools=')) return content
  return content.replace(/<manifest\b([^>]*)>/, '<manifest$1 xmlns:tools="http://schemas.android.com/tools">')
}

function ensurePermission(content, permission, attrs = '') {
  const line = `    <uses-permission android:name="${permission}"${attrs} />`
  const alreadyDeclared = new RegExp(`<uses-permission\\s+[^>]*android:name=["']${permission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`).test(content)
  if (alreadyDeclared) return content
  return content.replace(/(<manifest[^>]*>)/, `$1\n${line}`)
}

function ensurePermissionRemoval(content, permission) {
  const removalRegex = new RegExp(`<uses-permission\\s+[^>]*android:name=["']${permission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*tools:node=["']remove["'][^>]*>`)
  if (removalRegex.test(content)) return content
  return content.replace(/(<manifest[^>]*>)/, `$1\n    <uses-permission android:name="${permission}" tools:node="remove" />`)
}

if (!fs.existsSync(manifestPath)) {
  console.warn('AndroidManifest.xml not found; skipping Health Connect permission trim.')
  process.exit(0)
}

let manifest = fs.readFileSync(manifestPath, 'utf8')
manifest = ensureToolsNamespace(manifest)

for (const permission of keepReadPermissions) {
  manifest = ensurePermission(manifest, permission)
}

for (const permission of removePermissions) {
  manifest = ensurePermissionRemoval(manifest, permission)
}

fs.writeFileSync(manifestPath, manifest)

console.log('Health Connect permissions trimmed for HealthWallet: READ_STEPS, READ_ACTIVE_CALORIES_BURNED, READ_HEART_RATE, READ_WEIGHT kept; write/distance permissions removed from merged manifest.')
