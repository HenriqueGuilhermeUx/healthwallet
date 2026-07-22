import { Heart, FileText, Shield, Stethoscope } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur px-4 py-3">
      <div className="max-w-md mx-auto flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-3" aria-label="Ir para o início">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Heart className="w-5 h-5 text-white" />
          </div>

          <div className="font-bold text-lg leading-tight">
            HealthWallet
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <a
            href="https://mydatamed.com"
            target="_blank"
            rel="noreferrer"
            title="MyDataMed"
            aria-label="Abrir MyDataMed"
            className="w-9 h-9 rounded-xl border flex items-center justify-center hover:bg-emerald-50 transition-colors"
          >
            <Stethoscope className="w-4 h-4 text-emerald-600" />
          </a>

          <Link
            to="/consent"
            title="Consentimento Digital"
            aria-label="Consentimento Digital"
            className="w-9 h-9 rounded-xl border flex items-center justify-center hover:bg-blue-50 transition-colors"
          >
            <Shield className="w-4 h-4 text-blue-600" />
          </Link>

          <Link
            to="/documents"
            title="Documentos recebidos"
            aria-label="Documentos recebidos"
            className="w-9 h-9 rounded-xl border flex items-center justify-center hover:bg-muted/50 transition-colors"
          >
            <FileText className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </header>
  )
}
