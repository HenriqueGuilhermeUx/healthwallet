import React from 'react'
import { AlertTriangle } from 'lucide-react'

type Props = {
  children: React.ReactNode
}

type State = {
  hasError: boolean
  message?: string
}

export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('HealthWallet screen error', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Não foi possível abrir esta tela</h1>
          <p className="mt-2 text-sm text-gray-600">
            Atualize a tela ou volte para o início. Se o problema continuar, tente novamente em alguns instantes.
          </p>
          <div className="mt-5 grid gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white"
            >
              Atualizar
            </button>
            <a
              href="/dashboard"
              className="w-full rounded-xl border border-emerald-200 py-3 font-semibold text-emerald-700"
            >
              Voltar ao início
            </a>
          </div>
        </div>
      </div>
    )
  }
}
