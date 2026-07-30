import { Heart, FileText, Shield, Stethoscope } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function AppHeader() {
  return (
    <header
      className="sticky top-0 z-30 w-full border-b bg-background/98 px-4 pb-3 backdrop-blur"
      style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}
    >
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <Link to="/dashboard" className="flex min-w-0 items-center gap-3" aria-label="Ir para o início">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
            <Heart className="h-5 w-5 text-white" />
          </div>

          <div className="truncate text-xl font-bold leading-tight">
            HealthWallet
          </div>
        </Link>

        <div className="flex flex-shrink-0 items-center gap-2">
          <a
            href="https://mydatamed.com"
            target="_blank"
            rel="noreferrer"
            title="MyDataMed"
            aria-label="Abrir MyDataMed"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border bg-white/70 transition-colors hover:bg-emerald-50"
          >
            <Stethoscope className="h-4 w-4 text-emerald-600" />
          </a>

          <Link
            to="/consent"
            title="Consentimento Digital"
            aria-label="Consentimento Digital"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border bg-white/70 transition-colors hover:bg-blue-50"
          >
            <Shield className="h-4 w-4 text-blue-600" />
          </Link>

          <Link
            to="/documents"
            title="Documentos recebidos"
            aria-label="Documentos recebidos"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border bg-white/70 transition-colors hover:bg-muted/50"
          >
            <FileText className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  )
}
