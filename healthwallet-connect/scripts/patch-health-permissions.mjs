import fs from 'node:fs'
import path from 'node:path'

const profile = String(process.argv[2] || 'minimal').toLowerCase()
if (!['minimal', 'full'].includes(profile)) {
  throw new Error(`Unknown Health Connect permission profile: ${profile}`)
}

const manifestPath = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'AndroidManifest.xml')

const profiles = {
  minimal: [
    'android.permission.health.READ_STEPS',
  ],
  full: [
    'android.permission.health.READ_STEPS',
    'android.permission.health.READ_SLEEP',
    'android.permission.health.READ_HEART_RATE',
    'android.permission.health.READ_RESTING_HEART_RATE',
    'android.permission.health.READ_OXYGEN_SATURATION',
    'android.permission.health.READ_HEART_RATE_VARIABILITY',
    'android.permission.health.READ_BLOOD_PRESSURE',
    'android.permission.health.READ_WEIGHT',
    'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
    'android.permission.health.READ_EXERCISE',
    'android.permission.health.READ_EXERCISE_SESSION',
  ],
}

const knownPermissions = [
  ...profiles.full,
  'android.permission.health.READ_STEPS_CADENCE',
  'android.permission.health.READ_DISTANCE',
  'android.permission.health.WRITE_STEPS',
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

function stripPermission(content, permission) {
  const regex = new RegExp(`\\n?\\s*<uses-permission\\s+[^>]*android:name=["']${escapeRegex(permission)}["'][^>]*/?>`, 'g')
  return content.replace(regex, '')
}

function ensurePermission(content, permission, attrs = '') {
  const line = `    <uses-permission android:name="${permission}"${attrs} />`
  return content.replace(/(<manifest[^>]*>)/, `$1\n${line}`)
}

function ensureSchemeQuery(content, scheme) {
  const marker = `<data android:scheme="${scheme}" />`
  if (content.includes(marker)) return content

  const intent = `        <intent>\n            <action android:name="android.intent.action.VIEW" />\n            ${marker}\n        </intent>`

  if (content.includes('</queries>')) {
    return content.replace('</queries>', `${intent}\n    </queries>`)
  }

  const queries = `    <queries>\n${intent}\n    </queries>\n\n`
  return content.replace(/\s*<application/, `\n${queries}    <application`)
}

function ensureHandoffIntentFilter(content) {
  if (content.includes('android:scheme="healthwallet-connect"')) return content

  const intentFilter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="healthwallet-connect" android:host="handoff" />
            </intent-filter>`

  const mainActivity = /(<activity\b[^>]*android:name=["']\.MainActivity["'][^>]*>)([\s\S]*?)(<\/activity>)/
  if (!mainActivity.test(content)) {
    throw new Error('Could not find MainActivity while registering HealthWallet Connect handoff deep link.')
  }

  return content.replace(mainActivity, (_match, open, body, close) => `${open}${body}${intentFilter}\n        ${close}`)
}

if (!fs.existsSync(manifestPath)) {
  console.warn('AndroidManifest.xml not found; skipping Health Connect permission profile.')
  process.exit(0)
}

let manifest = fs.readFileSync(manifestPath, 'utf8')
manifest = ensureToolsNamespace(manifest)

for (const permission of knownPermissions) manifest = stripPermission(manifest, permission)

const keep = profiles[profile]
const remove = knownPermissions.filter((permission) => !keep.includes(permission))

for (const permission of keep) manifest = ensurePermission(manifest, permission)
for (const permission of remove) manifest = ensurePermission(manifest, permission, ' tools:node="remove"')

manifest = ensureHandoffIntentFilter(manifest)
manifest = ensureSchemeQuery(manifest, 'healthwallet')

fs.writeFileSync(manifestPath, manifest)
console.log(`HealthWallet Connect profile applied: ${profile}. Read permissions: ${keep.join(', ')}. Deep link: healthwallet-connect://handoff. Return target: healthwallet://`)
