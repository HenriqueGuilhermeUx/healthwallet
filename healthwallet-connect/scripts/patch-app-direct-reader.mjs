import fs from 'node:fs'
import path from 'node:path'

const appPath = path.join(process.cwd(), 'src', 'App.tsx')
let source = fs.readFileSync(appPath, 'utf8')

if (!source.includes("import { syncDirectAndroidSteps } from './services/directAndroidHealth'")) {
  source = source.replace(
    "import { supabase } from './lib/supabase'",
    "import { supabase } from './lib/supabase'\nimport { syncDirectAndroidSteps } from './services/directAndroidHealth'",
  )
}

source = source.replace(/\n\s*probeHealthAccess,/, '')

const start = source.indexOf('  async function continueAfterManualPermission() {')
const end = source.indexOf('\n  function backToHealthWallet()', start)
if (start === -1 || end === -1) throw new Error('Could not locate continueAfterManualPermission in App.tsx')

const replacement = `  async function continueAfterManualPermission() {
    if (!userId) return
    try {
      setBusy(true)
      setHandoffError('')
      setMessage('Leitor Android oficial: lendo passos diretamente do Health Connect, sem Capgo…')
      const result = await syncDirectAndroidSteps(userId, handoff?.days || 7)
      const now = new Date()
      setLastSync(now.toLocaleString())
      setPermissionRecovery(false)
      setMessage(\`Leitura Android direta funcionou: \${result.daysSynced} dia(s) de passos sincronizado(s). Hoje: \${result.latest.steps} passos.\`)

      if (handoff) {
        await delay(700)
        await returnToHealthWallet(handoff, {
          status: 'success',
          provider: result.provider,
          daysSynced: result.daysSynced,
        })
      }
    } catch (error: any) {
      const text = error?.message || 'O leitor Android direto não conseguiu sincronizar os passos.'
      setMessage(text)
      setHandoffError(text)
      setPermissionRecovery(true)
    } finally {
      setBusy(false)
    }
  }
`

source = source.slice(0, start) + replacement + source.slice(end)
source = source.replace('Já autorizei — testar leitura e sincronizar', 'Já autorizei — sincronizar passos direto pelo Android')
source = source.replace(
  'Se você já recusou permissões várias vezes, o Android pode deixar de exibir o pedido automático; a tela direta permite revisar e conceder manualmente.',
  'Depois de autorizar no Health Connect, este botão usa a API oficial do Android diretamente e não passa pelo plugin Capgo para ler passos.',
)

fs.writeFileSync(appPath, source)
console.log('App manual recovery routed to DirectHealthReader (Android platform API).')
