import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const variablesPath = path.join(root, 'android', 'variables.gradle')
const buildGradlePath = path.join(root, 'android', 'app', 'build.gradle')
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')
const packagePath = path.join(root, 'package.json')
const resPath = path.join(root, 'android', 'app', 'src', 'main', 'res')

const MIN_SDK_FOR_HEALTH_CONNECT = 26

function replaceIfExists(filePath, replacer) {
  if (!fs.existsSync(filePath)) return
  const current = fs.readFileSync(filePath, 'utf8')
  const next = replacer(current)
  if (next !== current) fs.writeFileSync(filePath, next)
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function writeIfChanged(filePath, content) {
  ensureDir(path.dirname(filePath))
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) return
  fs.writeFileSync(filePath, content)
}

function setApplicationAttr(content, attrName, attrValue) {
  const attrRegex = new RegExp(`${attrName}="[^"]*"`)
  if (attrRegex.test(content)) return content.replace(attrRegex, `${attrName}="${attrValue}"`)
  return content.replace('<application', `<application ${attrName}="${attrValue}"`)
}

function getPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    return pkg.version || '1.0.1'
  } catch {
    return '1.0.1'
  }
}

const androidVersionCode = Number(process.env.ANDROID_VERSION_CODE || process.env.GITHUB_RUN_NUMBER || 2)
const androidVersionName = process.env.ANDROID_VERSION_NAME || getPackageVersion()

const launcherBackgroundXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#0891B2" android:pathData="M0,0h108v108H0z" />
    <path android:fillColor="#22D3EE" android:fillAlpha="0.36" android:pathData="M0,9C20,0 34,7 52,17C72,29 88,25 108,12V108H0z" />
    <path android:fillColor="#0F4C81" android:fillAlpha="0.34" android:pathData="M0,78C25,65 43,72 63,81C80,88 94,87 108,78V108H0z" />
</vector>
`

const launcherForegroundXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#F8FAFC" android:fillAlpha="0.96" android:pathData="M31,35L67,18C74,15 82,19 85,26L92,45L39,60z" />
    <path android:fillColor="#14B8A6" android:fillAlpha="0.92" android:pathData="M30,38L78,29C86,28 93,34 94,42L96,61L39,66z" />
    <path android:fillColor="#FFFFFF" android:pathData="M23,36h61c7,0 12,5 12,12v31c0,7 -5,12 -12,12H23c-7,0 -12,-5 -12,-12V48c0,-7 5,-12 12,-12z" />
    <path android:fillColor="#F8FAFC" android:pathData="M75,55h18c5,0 9,4 9,9v9c0,5 -4,9 -9,9H75c-5,0 -9,-4 -9,-9v-9c0,-5 4,-9 9,-9z" />
    <path android:fillColor="#0EA5A8" android:pathData="M85,69m-5,0a5,5 0,1 0,10 0a5,5 0,1 0,-10 0" />
    <path android:fillColor="#0EA5A8" android:pathData="M52,82C50,80 41,73 35,67C30,62 27,57 27,51C27,43 33,38 40,38C45,38 49,40 52,45C55,40 59,38 64,38C72,38 77,43 77,51C77,57 74,62 69,67C63,73 54,80 52,82z" />
    <path android:fillColor="#00000000" android:strokeColor="#FFFFFF" android:strokeWidth="4.5" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="M27,62H39L43,56L49,73L56,49L62,62H77" />
</vector>
`

const launcherLegacyXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#0891B2" android:pathData="M0,0h108v108H0z" />
    <path android:fillColor="#22D3EE" android:fillAlpha="0.36" android:pathData="M0,9C20,0 34,7 52,17C72,29 88,25 108,12V108H0z" />
    <path android:fillColor="#0F4C81" android:fillAlpha="0.34" android:pathData="M0,78C25,65 43,72 63,81C80,88 94,87 108,78V108H0z" />
    <path android:fillColor="#F8FAFC" android:fillAlpha="0.96" android:pathData="M31,35L67,18C74,15 82,19 85,26L92,45L39,60z" />
    <path android:fillColor="#14B8A6" android:fillAlpha="0.92" android:pathData="M30,38L78,29C86,28 93,34 94,42L96,61L39,66z" />
    <path android:fillColor="#FFFFFF" android:pathData="M23,36h61c7,0 12,5 12,12v31c0,7 -5,12 -12,12H23c-7,0 -12,-5 -12,-12V48c0,-7 5,-12 12,-12z" />
    <path android:fillColor="#F8FAFC" android:pathData="M75,55h18c5,0 9,4 9,9v9c0,5 -4,9 -9,9H75c-5,0 -9,-4 -9,-9v-9c0,-5 4,-9 9,-9z" />
    <path android:fillColor="#0EA5A8" android:pathData="M85,69m-5,0a5,5 0,1 0,10 0a5,5 0,1 0,-10 0" />
    <path android:fillColor="#0EA5A8" android:pathData="M52,82C50,80 41,73 35,67C30,62 27,57 27,51C27,43 33,38 40,38C45,38 49,40 52,45C55,40 59,38 64,38C72,38 77,43 77,51C77,57 74,62 69,67C63,73 54,80 52,82z" />
    <path android:fillColor="#00000000" android:strokeColor="#FFFFFF" android:strokeWidth="4.5" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="M27,62H39L43,56L49,73L56,49L62,62H77" />
</vector>
`

const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/healthwallet_launcher_background" />
    <foreground android:drawable="@drawable/healthwallet_launcher_foreground" />
</adaptive-icon>
`

function writeHealthWalletLauncherIcons() {
  const drawablePath = path.join(resPath, 'drawable')
  const mipmapAnyDpiPath = path.join(resPath, 'mipmap-anydpi')
  const mipmapV26Path = path.join(resPath, 'mipmap-anydpi-v26')

  writeIfChanged(path.join(drawablePath, 'healthwallet_launcher_background.xml'), launcherBackgroundXml)
  writeIfChanged(path.join(drawablePath, 'healthwallet_launcher_foreground.xml'), launcherForegroundXml)
  writeIfChanged(path.join(mipmapAnyDpiPath, 'ic_launcher.xml'), launcherLegacyXml)
  writeIfChanged(path.join(mipmapAnyDpiPath, 'ic_launcher_round.xml'), launcherLegacyXml)
  writeIfChanged(path.join(mipmapV26Path, 'ic_launcher.xml'), adaptiveIconXml)
  writeIfChanged(path.join(mipmapV26Path, 'ic_launcher_round.xml'), adaptiveIconXml)
}

replaceIfExists(variablesPath, (content) => {
  return content
    .replace(/compileSdkVersion\s*=\s*\d+/g, 'compileSdkVersion = 35')
    .replace(/targetSdkVersion\s*=\s*\d+/g, 'targetSdkVersion = 35')
    .replace(/minSdkVersion\s*=\s*\d+/g, `minSdkVersion = ${MIN_SDK_FOR_HEALTH_CONNECT}`)
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
      next = next.replace(/(<manifest[^>]*>)/, `$1\n    ${permission}`)
    }
  }

  if (!next.includes('android:usesCleartextTraffic')) {
    next = next.replace('<application', '<application android:usesCleartextTraffic="false"')
  }

  next = setApplicationAttr(next, 'android:icon', '@mipmap/ic_launcher')
  next = setApplicationAttr(next, 'android:roundIcon', '@mipmap/ic_launcher_round')

  return next
})

writeHealthWalletLauncherIcons()

replaceIfExists(buildGradlePath, (content) => {
  const hasSigningSecrets = Boolean(
    process.env.ANDROID_KEYSTORE_PASSWORD &&
    process.env.ANDROID_KEY_ALIAS &&
    process.env.ANDROID_KEY_PASSWORD
  )

  let next = content

  next = next
    .replace(/versionCode\s+\d+/g, `versionCode ${androidVersionCode}`)
    .replace(/versionName\s+['"][^'"]+['"]/g, `versionName "${androidVersionName}"`)

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

console.log(`Android project patched for HealthWallet release build. versionCode=${androidVersionCode}, versionName=${androidVersionName}, minSdk=${MIN_SDK_FOR_HEALTH_CONNECT}, launcherIcon=healthwallet-v2`)
