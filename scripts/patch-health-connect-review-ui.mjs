import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const deviceDataPath = path.join(root, 'src', 'pages', 'DeviceData.tsx')

function replaceRequired(content, from, to) {
  if (!content.includes(from)) {
    console.warn(`Review UI patch skipped missing text: ${from.slice(0, 80)}`)
    return content
  }
  return content.replace(from, to)
}

if (!fs.existsSync(deviceDataPath)) {
  console.warn('DeviceData.tsx not found; skipping Health Connect review UI patch.')
  process.exit(0)
}

let content = fs.readFileSync(deviceDataPath, 'utf8')

content = replaceRequired(
  content,
  "subtitle: 'Sincronização automática com smartwatches, pulseiras e apps Android compatíveis.',",
  "subtitle: 'Sincronização automática de passos diários com o Android Health Connect, com autorização do usuário.',"
)

content = replaceRequired(
  content,
  'Sincronize automaticamente passos, sono, batimentos, pressão, peso e SpO2 para enriquecer seu histórico e refinar o MedScore.',
  'Com sua autorização, importe passos diários do Android Health Connect para sua carteira pessoal de saúde. Outros dados podem ser registrados manualmente ou em versões futuras revisadas.'
)

content = replaceRequired(
  content,
  'Você controla o acesso. Dados de dispositivos são complementares, podem variar por aparelho e não substituem avaliação profissional.',
  'Você controla o acesso. No Android, esta versão lê apenas passos diários do Health Connect. Esses dados são contexto de bem-estar e não substituem avaliação profissional.'
)

content = replaceRequired(
  content,
  'Fonte deste aparelho: {nativeProviderLabel}. O app atualiza os dados ao abrir a tela e você pode sincronizar agora.',
  'Fonte deste aparelho: {nativeProviderLabel}. No Android, o app pede somente permissão de passos para mostrar sua atividade diária na linha do tempo.'
)

fs.writeFileSync(deviceDataPath, content)
console.log('Health Connect Play review UI copy patched: Android wording limited to daily steps only.')
