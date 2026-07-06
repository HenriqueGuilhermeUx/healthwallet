import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const variablesPath = path.join(root, 'android', 'variables.gradle')
const buildGradlePath = path.join(root, 'android', 'app', 'build.gradle')
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')

function replaceIfExists(filePath, replacer) {
  if (!fs.existsSync(filePath)) return
  const current = fs.readFileSync(filePath, 'utf8')
  const next = replacer(current)
  if (next !== current) fs.writeFileSync(filePath, next)
}

replaceIfExists(variablesPath, (content) => {
  return content
    .replace(/compileSdkVersion\s*=\s*\d+/g, 'compileSdkVersion = 35')
    .replace(/targetSdkVersion\s*=\s*\d+/g, 'targetSdkVersion = 35')
    .replace(/minSdkVersion\s*=\s*\d+/g, 'minSdkVersion = 23')
})

replaceIfExists(manifestPath, (content) => {
  let next = content

  const permissions = [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  ]

  for (const permission of permissions) {
    if (!next.includes(permission)) {
      next = next.replace('<manifest', `${permission}\n<manifest`)
    }
  }

  if (!next.includes('android:usesCleartextTraffic')) {
    next = next.replace('<application', '<application android:usesCleartextTraffic="false"')
  }

  return next
})

replaceIfExists(buildGradlePath, (content) => {
  const hasSigningSecrets = Boolean(
    process.env.ANDROID_KEYSTORE_PASSWORD &&
    process.env.ANDROID_KEY_ALIAS &&
    process.env.ANDROID_KEY_PASSWORD
  )

  let next = content

  if (hasSigningSecrets && !next.includes('healthwalletRelease')) {
    next = next.replace(
      /android\s*\{/, 
      `android {\n    signingConfigs {\n        healthwalletRelease {\n            storeFile file("healthwallet-release.jks")\n            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")\n            keyAlias System.getenv("ANDROID_KEY_ALIAS")\n            keyPassword System.getenv("ANDROID_KEY_PASSWORD")\n        }\n    }`
    )

    next = next.replace(
      /release\s*\{/, 
      `release {\n            signingConfig signingConfigs.healthwalletRelease`
    )
  }

  return next
})

console.log('Android project patched for HealthWallet release build.')
