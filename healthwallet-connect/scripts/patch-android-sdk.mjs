import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const variablesPath = path.join(root, 'android', 'variables.gradle')

if (!fs.existsSync(variablesPath)) {
  console.warn('android/variables.gradle not found; skipping Android SDK patch.')
  process.exit(0)
}

let content = fs.readFileSync(variablesPath, 'utf8')

const minSdkPattern = /minSdkVersion\s*=\s*\d+/
if (!minSdkPattern.test(content)) {
  throw new Error('Could not find minSdkVersion in android/variables.gradle')
}

content = content.replace(minSdkPattern, 'minSdkVersion = 26')
fs.writeFileSync(variablesPath, content)

console.log('HealthWallet Connect Android minSdkVersion set to 26 for @capgo/capacitor-health compatibility.')
