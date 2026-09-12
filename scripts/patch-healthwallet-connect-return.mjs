import fs from 'node:fs'
import path from 'node:path'

const manifestPath = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'AndroidManifest.xml')

if (!fs.existsSync(manifestPath)) {
  throw new Error('AndroidManifest.xml not found. Run cap sync android before patching HealthWallet Connect return URL.')
}

let manifest = fs.readFileSync(manifestPath, 'utf8')

if (!manifest.includes('android:scheme="healthwallet"')) {
  const intentFilter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="healthwallet" android:host="connect-complete" />
            </intent-filter>`

  const mainActivity = /(<activity\b[^>]*android:name=["']\.MainActivity["'][^>]*>)([\s\S]*?)(<\/activity>)/
  if (!mainActivity.test(manifest)) {
    throw new Error('Could not find MainActivity while registering HealthWallet Connect return deep link.')
  }

  manifest = manifest.replace(mainActivity, (_match, open, body, close) => `${open}${body}${intentFilter}\n        ${close}`)
  fs.writeFileSync(manifestPath, manifest)
}

console.log('HealthWallet Connect return deep link registered: healthwallet://connect-complete')
