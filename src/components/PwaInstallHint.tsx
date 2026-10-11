import { useEffect, useState } from 'react'

type InstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PwaInstallHint() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)
  const [visible, setVisible] = useState(false)
  const [ios, setIos] = useState(false)

  useEffect(() => {
    const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.())
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    if (isNative || standalone || localStorage.getItem('healthwallet-pwa-dismissed') === '1') return

    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    setIos(isIos)

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPrompt)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    const timer = window.setTimeout(() => {
      if (isIos) setVisible(true)
    }, 1500)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('beforeinstallprompt', onPrompt)
    }
  }, [])

  if (!visible || (!ios && !prompt)) return null

  function close() {
    localStorage.setItem('healthwallet-pwa-dismissed', '1')
    setVisible(false)
  }

  async function install() {
    if (!prompt) return
    await prompt.prompt()
    await prompt.userChoice
    setPrompt(null)
    setVisible(false)
  }

  return (
    <aside className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-md rounded-2xl border border-cyan-200 bg-white p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <img src="/icons/icon-192.png" alt="" className="h-12 w-12 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-900">Instalar HealthWallet</p>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            {ios
              ? 'No Safari: toque em Compartilhar e depois em “Adicionar à Tela de Início”.'
              : 'Use o HealthWallet em tela cheia direto da sua tela inicial.'}
          </p>
          {!ios && prompt ? (
            <button onClick={install} className="mt-3 rounded-xl bg-cyan-700 px-4 py-2 text-sm font-bold text-white">
              Instalar
            </button>
          ) : null}
        </div>
        <button onClick={close} aria-label="Fechar" className="px-2 py-1 text-slate-500">×</button>
      </div>
    </aside>
  )
}
