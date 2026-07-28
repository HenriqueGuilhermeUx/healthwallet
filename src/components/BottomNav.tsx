import { Home, FileText, User, Mail, Video, ShieldCheck } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

const navItems = [
  { icon: Home, label: 'Início', path: '/dashboard' },
  { icon: FileText, label: 'Exames', path: '/exams' },
  { icon: Video, label: 'Consulta', path: '/telemedicine' },
  { icon: ShieldCheck, label: 'Vínculos', path: '/care-links' },
  { icon: Mail, label: 'Receitas', path: '/documents' },
  { icon: User, label: 'Perfil', path: '/profile' },
]

export default function BottomNav() {
  const location = useLocation()

  return (
    <nav
      className="fixed left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-3xl border bg-background/95 px-2 py-2 shadow-lg backdrop-blur"
      style={{ bottom: 'calc(1.35rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="flex items-center justify-around">
        {navItems.map(({ icon: Icon, label, path }) => {
          const isActive = location.pathname === path
          return (
            <Link
              key={path}
              to={path}
              className={`flex min-w-[48px] flex-col items-center gap-1 rounded-2xl px-1.5 py-2 transition-all ${
                isActive ? 'bg-emerald-50 text-emerald-600' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? 'fill-emerald-600/20' : ''}`} />
              <span className="text-[9px] font-semibold leading-none">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
