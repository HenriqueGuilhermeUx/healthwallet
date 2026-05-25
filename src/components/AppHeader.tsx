import { Heart, Bell } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur px-4 py-3">
      <div className="max-w-md mx-auto flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg">HealthWallet</span>
        </Link>
        <button className="w-9 h-9 rounded-xl border flex items-center justify-center hover:bg-muted/50">
          <Bell className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}