import { BarChart3, HeartPulse, Stethoscope, Users } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

const links = [
  { href: '/concierge/ops', label: 'Fila', icon: Stethoscope },
  { href: '/concierge/ops/roster', label: 'Carteira', icon: Users },
  { href: '/concierge/ops/pilot', label: 'Piloto', icon: BarChart3 },
]

export default function ConciergeProfessionalHeader() {
  const location = useLocation()

  return (
    <header className="sticky top-0 z-30 border-b bg-slate-950 text-white shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link to="/concierge/ops" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600"><Stethoscope className="h-5 w-5" /></div>
          <div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">MyDataMed</p><p className="font-bold leading-tight">Concierge Ops</p></div>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === '/concierge/ops'
              ? location.pathname === href || location.pathname.startsWith('/concierge/ops/case/')
              : location.pathname.startsWith(href)
            return <Link key={href} to={href} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${active ? 'bg-white text-slate-950' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}><Icon className="h-3.5 w-3.5" /> {label}</Link>
          })}
          <Link to="/dashboard" title="Ir para HealthWallet" className="ml-1 flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"><HeartPulse className="h-4 w-4" /></Link>
        </nav>
      </div>
    </header>
  )
}
