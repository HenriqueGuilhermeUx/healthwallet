import { Home, FileText, Brain, User } from 'lucide-react'
import { useLocation } from 'react-router-dom'

const navItems = [
  { icon: Home, label: 'Início', path: '/dashboard' },
  { icon: FileText, label: 'Exames', path: '/exams' },
  { icon: Brain, label: 'IA', path: '/chat' },
  { icon: User, label: 'Perfil', path: '/profile' },
]

export default function BottomNav() {
  const location = useLocation()

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-background/95 backdrop-blur border-t px-2 py-2 flex items-center justify-around z-50">
      {navItems.map(({ icon: Icon, label, path }) => {
        const isActive = location.pathname === path
        return (
          <a
            key={path}
            href={path}
            className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-all ${
              isActive ? 'text-emerald-600' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className={`w-5 h-5 ${isActive ? 'fill-emerald-600/20' : ''}`} />
            <span className="text-[10px] font-medium">{label}</span>
          </a>
        )
      })}
    </nav>
  )
}