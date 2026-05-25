import { Heart, Bell, Menu, Loader2, Activity, Upload, Brain, QrCode, Pill, Calendar, Shield, ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useState, useEffect } from 'react'

interface HealthScore {
  score: number
  level: string
  color: string
}

interface StatItem {
  label: string
  value: string | number
  icon: React.ElementType
  color: string
}

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const [healthScore, setHealthScore] = useState<HealthScore>({ score: 0, level: 'Carregando...', color: 'gray' })
  const [stats, setStats] = useState<StatItem[]>([])
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    loadDashboardData()
  }, [user])

  const loadDashboardData = async () => {
    if (!user) return

    try {
      // Carregar profile do usuário
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      // Carregar exames
      const { count: examsCount } = await supabase
        .from('medical_records')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      // Carregar medicamentos ativos
      const { count: medsCount } = await supabase
        .from('medications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_active', true)

      // Carregar carteirinhas
      const { count: cardsCount } = await supabase
        .from('health_plans')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      // Calcular score (baseado em dados preenchidos)
      let score = 50 // base
      if (profile?.birth_date) score += 10
      if (profile?.blood_type) score += 10
      if (profile?.allergies && profile.allergies.length > 0) score += 10
      if (examsCount && examsCount > 0) score += 10
      if (medsCount && medsCount > 0) score += 10

      const level = score >= 80 ? 'Excelente' : score >= 60 ? 'Bom' : score >= 40 ? 'Regular' : 'Atenção'
      const color = score >= 80 ? 'emerald' : score >= 60 ? 'teal' : score >= 40 ? 'yellow' : 'red'

      setHealthScore({ score, level, color })
      setStats([
        { label: 'Exames', value: examsCount || 0, icon: Activity, color: 'text-blue-600' },
        { label: 'Medicamentos', value: medsCount || 0, icon: Pill, color: 'text-orange-600' },
        { label: 'Carteirinhas', value: cardsCount || 0, icon: QrCode, color: 'text-purple-600' },
      ])
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/'
  }

  const userName = user?.user_metadata?.full_name?.split(' ')[0] ||
                   user?.user_metadata?.name?.split(' ')[0] ||
                   'Usuário'

  const scoreColorMap: Record<string, string> = {
    emerald: 'text-emerald-600',
    teal: 'text-teal-600',
    yellow: 'text-yellow-600',
    red: 'text-red-600',
    gray: 'text-gray-600',
  }

  return (
    <div className="space-y-5">
      {/* Score Card */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-5 text-white">
        <div className="flex items-center gap-4">
          <div className="relative">
            <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="10" />
              <circle
                cx="50" cy="50" r="40" fill="none"
                stroke="white" strokeWidth="10"
                strokeDasharray={`${(healthScore.score / 100) * 251.2} 251.2`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold">{healthScore.score}</span>
              <span className="text-xs opacity-80">/100</span>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1">HealthScore</p>
            <p className="text-xl font-bold">{healthScore.level}</p>
            <p className="text-white/80 text-sm mb-3">Olá, {userName}!</p>
            <a
              href="/profile"
              className="inline-flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors"
            >
              Ver perfil <ChevronRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Ações rápidas</h2>
        <div className="grid grid-cols-4 gap-2">
          <QuickAction icon={Upload} label="Exame" color="bg-violet-600" href="/upload" />
          <QuickAction icon={Brain} label="Traduzir" color="bg-purple-600" href="/translator" />
          <QuickAction icon={QrCode} label="QR Code" color="bg-teal-600" href="/wallet" />
          <QuickAction icon={Pill} label="Remédios" color="bg-orange-600" href="/medications" />
        </div>
      </div>

      {/* Stats */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Sua saúde</h2>
        <div className="grid grid-cols-3 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-card rounded-xl p-3 border border-border text-center">
              <stat.icon className={`w-5 h-5 mx-auto mb-2 ${stat.color}`} />
              <p className="text-lg font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Menu */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {[
          { icon: QrCode, label: 'Carteirinha de Saúde', href: '/wallet' },
          { icon: Calendar, label: 'Calendário', href: '/exams' },
          { icon: Shield, label: 'Perfil de Emergência', href: '/profile' },
          { icon: Brain, label: 'Família', href: '/family' },
        ].map((item, idx, arr) => (
          <a
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors ${
              idx < arr.length - 1 ? 'border-b border-border' : ''
            }`}
          >
            <item.icon className="w-5 h-5 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">{item.label}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </a>
        ))}
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full py-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors text-sm font-medium"
      >
        Sair da conta
      </button>
    </div>
  )
}

function QuickAction({ icon: Icon, label, color, href }: {
  icon: React.ElementType
  label: string
  color: string
  href: string
}) {
  return (
    <a
      href={href}
      className="flex flex-col items-center gap-2 p-3 rounded-xl bg-card border border-border hover:bg-muted/50 active:scale-95 transition-all"
    >
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <span className="text-xs font-medium">{label}</span>
    </a>
  )
}