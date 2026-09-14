import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const buildGradlePath = path.join(root, 'android', 'app', 'build.gradle')
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')
const iconPath = path.join(root, 'android', 'app', 'src', 'main', 'res', 'drawable', 'healthwallet_connect_icon.xml')

const versionCode = Number(process.env.ANDROID_VERSION_CODE || process.env.GITHUB_RUN_NUMBER || 1)
const versionName = process.env.ANDROID_VERSION_NAME || '0.3.0'

function replaceIfExists(filePath, replacer) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing file: ${filePath}`)
  const current = fs.readFileSync(filePath, 'utf8')
  const next = replacer(current)
  if (next !== current) fs.writeFileSync(filePath, next)
}

function setApplicationAttr(content, attrName, attrValue) {
  const regex = new RegExp(`${attrName}="[^"]*"`)
  if (regex.test(content)) return content.replace(regex, `${attrName}="${attrValue}"`)
  return content.replace('<application', `<application ${attrName}="${attrValue}"`)
}

fs.mkdirSync(path.dirname(iconPath), { recursive: true })
fs.writeFileSync(iconPath, `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#0891B2" android:pathData="M0,0h108v108H0z" />
    <path android:fillColor="#22D3EE" android:fillAlpha="0.30" android:pathData="M0,12C22,1 39,8 57,18C75,28 91,26 108,14V108H0z" />
    <path android:fillColor="#FFFFFF" android:pathData="M54,84C50,80 27,63 27,47C27,37 35,30 44,30C50,30 54,33 58,39C62,33 66,30 72,30C82,30 89,37 89,47C89,62 66,80 62,84L58,87z" />
    <path android:fillColor="#0891B2" android:pathData="M28,57H43L48,49L55,68L63,42L69,57H83" />
</vector>
`)

replaceIfExists(manifestPath, (content) => {
  let next = content
  next = setApplicationAttr(next, 'android:label', 'HealthWallet Connect')
  next = setApplicationAttr(next, 'android:icon', '@drawable/healthwallet_connect_icon')
  next = setApplicationAttr(next, 'android:roundIcon', '@drawable/healthwallet_connect_icon')
  next = setApplicationAttr(next, 'android:usesCleartextTraffic', 'false')
  return next
})

replaceIfExists(buildGradlePath, (content) => {
  let next = content
    .replace(/versionCode\s+\d+/g, `versionCode ${versionCode}`)
    .replace(/versionName\s+["'][^"']+["']/g, `versionName "${versionName}"`)

  const hasSigning = Boolean(
    process.env.ANDROID_KEYSTORE_PASSWORD &&
    process.env.ANDROID_KEY_ALIAS &&
    process.env.ANDROID_KEY_PASSWORD
  )

  if (hasSigning && !next.includes('healthwalletConnectRelease')) {
    next = next.replace(
      /android\s*\{/,
      `android {\n    signingConfigs {\n        healthwalletConnectRelease {\n            storeFile file("healthwallet-connect-release.jks")\n            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")\n            keyAlias System.getenv("ANDROID_KEY_ALIAS")\n            keyPassword System.getenv("ANDROID_KEY_PASSWORD")\n        }\n    }`
    )

    next = next.replace(
      /release\s*\{/,
      `release {\n            signingConfig signingConfigs.healthwalletConnectRelease`
    )
  }

  return next
})

console.log(`HealthWallet Connect release patch applied. versionCode=${versionCode}, versionName=${versionName}`)
