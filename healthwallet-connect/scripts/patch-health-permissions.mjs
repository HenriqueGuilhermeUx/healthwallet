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
  ],
}

// @capgo/capacitor-health v8 ships a broad manifest so consumers can opt into
// many Health Connect data types. HealthWallet Connect is deliberately read-only
// and requests only the product scopes below, so remove every other Health
// permission contributed by the plugin at manifest-merge time.
const pluginPermissions = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.WRITE_STEPS',
  'android.permission.health.READ_DISTANCE',
  'android.permission.health.WRITE_DISTANCE',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  'android.permission.health.WRITE_ACTIVE_CALORIES_BURNED',
  'android.permission.health.READ_HEART_RATE',
  'android.permission.health.WRITE_HEART_RATE',
  'android.permission.health.READ_WEIGHT',
  'android.permission.health.WRITE_WEIGHT',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.WRITE_SLEEP',
  'android.permission.health.READ_RESPIRATORY_RATE',
  'android.permission.health.WRITE_RESPIRATORY_RATE',
  'android.permission.health.READ_OXYGEN_SATURATION',
  'android.permission.health.WRITE_OXYGEN_SATURATION',
  'android.permission.health.READ_RESTING_HEART_RATE',
  'android.permission.health.WRITE_RESTING_HEART_RATE',
  'android.permission.health.READ_HEART_RATE_VARIABILITY',
  'android.permission.health.WRITE_HEART_RATE_VARIABILITY',
  'android.permission.health.READ_VO2_MAX',
  'android.permission.health.WRITE_VO2_MAX',
  'android.permission.health.READ_BLOOD_PRESSURE',
  'android.permission.health.WRITE_BLOOD_PRESSURE',
  'android.permission.health.READ_BLOOD_GLUCOSE',
  'android.permission.health.WRITE_BLOOD_GLUCOSE',
  'android.permission.health.READ_BODY_TEMPERATURE',
  'android.permission.health.WRITE_BODY_TEMPERATURE',
  'android.permission.health.READ_HEIGHT',
  'android.permission.health.WRITE_HEIGHT',
  'android.permission.health.READ_FLOORS_CLIMBED',
  'android.permission.health.WRITE_FLOORS_CLIMBED',
  'android.permission.health.READ_BODY_FAT',
  'android.permission.health.WRITE_BODY_FAT',
  'android.permission.health.READ_BASAL_BODY_TEMPERATURE',
  'android.permission.health.WRITE_BASAL_BODY_TEMPERATURE',
  'android.permission.health.READ_BASAL_METABOLIC_RATE',
  'android.permission.health.WRITE_BASAL_METABOLIC_RATE',
  'android.permission.health.READ_TOTAL_CALORIES_BURNED',
  'android.permission.health.WRITE_TOTAL_CALORIES_BURNED',
  'android.permission.health.READ_MINDFULNESS',
  'android.permission.health.WRITE_MINDFULNESS',
  'android.permission.health.READ_HYDRATION',
  'android.permission.health.WRITE_HYDRATION',
  'android.permission.health.READ_NUTRITION',
  'android.permission.health.WRITE_NUTRITION',
  'android.permission.health.READ_EXERCISE',
  'android.permission.health.READ_HEALTH_DATA_HISTORY',
  'android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND',
]

// Historical leftovers from older builds that must never leak back in.
const legacyPermissions = [
  'android.permission.health.READ_EXERCISE_SESSION',
  'android.permission.health.READ_STEPS_CADENCE',
]

const knownPermissions = Array.from(new Set([...pluginPermissions, ...legacyPermissions, ...profiles.full]))

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
  if (content.includes('</queries>')) return content.replace('</queries>', `${intent}\n    </queries>`)
  const queries = `    <queries>\n${intent}\n    </queries>\n\n`
  return content.replace(/\s*<application/, `\n${queries}    <application`)
}

function ensureHealthConnectProviderQuery(content) {
  const marker = '<package android:name="com.google.android.apps.healthdata" />'
  if (content.includes(marker)) return content
  if (content.includes('</queries>')) {
    return content.replace('</queries>', `        ${marker}\n    </queries>`)
  }
  const queries = `    <queries>\n        ${marker}\n    </queries>\n\n`
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
  if (!mainActivity.test(content)) throw new Error('Could not find MainActivity while registering HealthWallet Connect handoff deep link.')
  return content.replace(mainActivity, (_match, open, body, close) => `${open}${body}${intentFilter}\n        ${close}`)
}

function ensureHealthConnectRationale(content) {
  if (content.includes('androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE')) return content
  const block = `
        <activity
            android:name="app.capgo.plugin.health.PermissionsRationaleActivity"
            android:exported="true"
            android:theme="@android:style/Theme.DeviceDefault.Light.NoActionBar">
            <intent-filter>
                <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />
            </intent-filter>
        </activity>
        <activity-alias
            android:name="app.capgo.plugin.health.ViewPermissionUsageActivity"
            android:exported="true"
            android:targetActivity="app.capgo.plugin.health.PermissionsRationaleActivity"
            android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
            <intent-filter>
                <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
                <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
            </intent-filter>
        </activity-alias>`
  return content.replace('</application>', `${block}\n    </application>`)
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
manifest = ensureHealthConnectProviderQuery(manifest)
manifest = ensureHealthConnectRationale(manifest)

fs.writeFileSync(manifestPath, manifest)
console.log(`HealthWallet Connect profile applied: ${profile}. Read permissions: ${keep.join(', ')}. All other plugin health scopes are removed. Deep link: healthwallet-connect://handoff.`)
