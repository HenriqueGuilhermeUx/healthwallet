import {
  Loader2,
  Activity,
  QrCode,
  Pill,
  Calendar,
  Shield,
  ChevronRight,
  FileText,
  Users,
  MessageCircle,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { calculateMedScore } from '@/services/calculateMedScore'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const [loading, setLoading] = useState(true)
  const [medScore, setMedScore] = useState<any>(null)
  const [stats, setStats] = useState({ exams: 0, medications: 0, cards: 0, family: 0 })

  useEffect(() => {
    loadDashboardData()
  }, [user])

  async function loadDashboardData() {
    if (!user) return

    try {
      const [profileRes, examsCount, medsCount, cardsCount, familyCount, conditionsRes, recordsRes] =
        await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          supabase.from('medical_records').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('medications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', true),
          supabase.from('health_plans').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('family_members').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('patient_conditions').select('*').eq('user_id', user.id),
          supabase.from('medical_records').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
        ])

      const profile = profileRes.data || {}
      const calculated = calculateMedScore(profile, recordsRes.data || [], conditionsRes.data || [])

      await supabase.from('health_scores').insert({
        user_id: user.id,
        score: calculated.score,
        status: calculated.level,
        factors: {
          confidence: calculated.confidence,
          levelColor: calculated.levelColor,
          missingExams: calculated.missingExams,
          alerts: calculated.alerts,
          recommendations: calculated.recommendations,
          metrics: calculated.metrics,
          breakdown: calculated.breakdown,
          cockpit: calculated.cockpit,
        },
        calculated_at: new Date().toISOString(),
      })

      setStats({
        exams: examsCount.count || 0,
        medications: medsCount.count || 0,
        cards: cardsCount.count || 0,
        family: familyCount.count || 0,
      })

      setMedScore(calculated)
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    await signOut()
    window.location.href = '/'
  }

  const userName =
    user?.user_metadata?.full_name?.split(' ')[0] ||
    user?.user_metadata?.name?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'Usuário'

  if (loading || !medScore) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-20">
      <Link
        to="/medscore"
        className="block rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-5 text-white relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative">
          <p className="text-white/80 text-sm mb-1">Olá, {userName}</p>

          <div className="flex items-center gap-4">
            <div className="relative">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="10" />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="white"
                  strokeWidth="10"
                  strokeDasharray={`${(medScore.score / 100) * 251.2} 251.2`}
                  strokeLinecap="round"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold">{medScore.score}</span>
                <span className="text-xs opacity-80">/100</span>
              </div>
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4" />
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider">
                  MedScore
                </p>
              </div>

              <h1 className="text-2xl font-bold">
                Acesse seu MedScore
              </h1>

              <p className="text-white/80 text-sm mt-1">
                Veja áreas analisadas, melhorias possíveis e exames recomendados.
              </p>

              <div className="flex items-center gap-2 mt-3">
                <TrendingUp className="w-4 h-4 text-emerald-300" />
                <span className="text-xs text-white/80">
                  {medScore.confidence}% de confiança dos dados
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <ActionCard icon={Activity} label="Exames" value={stats.exams} href="/exams" />
        <ActionCard icon={Pill} label="Remédios" value={stats.medications} href="/medications" />
        <ActionCard icon={FileText} label="Carteiras Plano/SUS" value={stats.cards} href="/wallet" />
        <ActionCard icon={Users} label="Família" value={stats.family} href="/family" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/upload" className="p-4 rounded-xl bg-violet-600 text-white font-semibold text-center">
          Subir exames
        </Link>
        <Link to="/profile" className="p-4 rounded-xl bg-emerald-600 text-white font-semibold text-center">
          Atualizar dados
        </Link>
        <Link to="/summary" className="p-4 rounded-xl bg-blue-600 text-white font-semibold text-center">
          Resumo
        </Link>
        <Link to="/chat" className="p-4 rounded-xl bg-purple-600 text-white font-semibold text-center">
          Conversar com IA
        </Link>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <MenuItem icon={QrCode} label="Carteiras Plano/SUS" href="/wallet" />
        <MenuItem icon={Calendar} label="Agenda de Saúde" href="/timeline" />
        <MenuItem icon={Shield} label="Prontuário Digital" href="/passport" />
        <MenuItem icon={Users} label="Membros da Família" href="/family" />
        <MenuItem icon={MessageCircle} label="Assistente de IA" href="/chat" last />
      </div>

      <button
        onClick={handleLogout}
        className="w-full py-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors text-sm font-medium"
      >
        Sair da conta
      </button>
    </div>
  )
}

function ActionCard({ icon: Icon, label, value, href }: any) {
  return (
    <Link to={href} className="bg-card rounded-xl border border-border p-4">
      <Icon className="w-5 h-5 text-emerald-600 mb-2" />
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Link>
  )
}

function MenuItem({ icon: Icon, label, href, last }: any) {
  return (
    <Link
      to={href}
      className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors ${
        !last ? 'border-b border-border' : ''
      }`}
    >
      <Icon className="w-5 h-5 text-muted-foreground" />
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </Link>
  )
}
