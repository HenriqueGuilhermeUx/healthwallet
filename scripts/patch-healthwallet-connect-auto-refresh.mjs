import fs from 'node:fs'
import path from 'node:path'

const appPath = path.join(process.cwd(), 'src', 'App.tsx')
const devicePath = path.join(process.cwd(), 'src', 'pages', 'DeviceData.tsx')

let app = fs.readFileSync(appPath, 'utf8')
let device = fs.readFileSync(devicePath, 'utf8')

const bridgeNeedle = "        sessionStorage.setItem('healthwallet_connect_return', JSON.stringify(payload))\n        navigate('/devices')"
const bridgeReplacement = "        sessionStorage.setItem('healthwallet_connect_return', JSON.stringify(payload))\n        window.dispatchEvent(new CustomEvent('healthwallet-connect-return', { detail: payload }))\n        navigate('/devices')"

if (!app.includes("window.dispatchEvent(new CustomEvent('healthwallet-connect-return'")) {
  if (!app.includes(bridgeNeedle)) throw new Error('Connect return bridge marker not found in src/App.tsx')
  app = app.replace(bridgeNeedle, bridgeReplacement)
}

const listenerMarker = "  async function load(allowAutoSync = true) {"
const listenerBlock = `  useEffect(() => {
    function handleConnectReturn(event: Event) {
      const detail = (event as CustomEvent<any>).detail || {}
      sessionStorage.removeItem('healthwallet_connect_return')

      if (detail?.status === 'success') {
        const days = Number(detail?.days_synced || 0)
        toast.success(days > 0
          ? \`HealthWallet Connect atualizado: \${days} dia(s) sincronizado(s)\`
          : 'HealthWallet Connect concluído com sucesso')
      } else {
        toast.error(detail?.message || 'O HealthWallet Connect não concluiu a sincronização.')
      }

      if (user) void load(false)
    }

    window.addEventListener('healthwallet-connect-return', handleConnectReturn as EventListener)
    return () => window.removeEventListener('healthwallet-connect-return', handleConnectReturn as EventListener)
  }, [user?.id])

`

if (!device.includes("window.addEventListener('healthwallet-connect-return'")) {
  const index = device.indexOf(listenerMarker)
  if (index === -1) throw new Error('load() marker not found in DeviceData.tsx')
  device = device.slice(0, index) + listenerBlock + device.slice(index)
}

fs.writeFileSync(appPath, app)
fs.writeFileSync(devicePath, device)

console.log('HealthWallet Test will refresh Device Data immediately after Connect return.')
