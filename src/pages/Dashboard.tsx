import { Heart, Bell, Menu, Loader2, Activity, Upload, Brain, QrCode, Pill, Calendar, Shield, ChevronRight, FileText, Users, Stethoscope, Camera, MessageCircle, Sparkles, AlertCircle, TrendingUp } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { calculateMedScore } from '@/services/calculateMedScore'

interface MedScore {
  score: number
  level: string
  levelColor: string
  confidence: number
  breakdown: {
    category: string
    score: number
    icon: string
  }[]
  missingExams: string[]
}

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const [medScore, setMedScore] = useState<MedScore>({
    score: 0,
    level: 'Calculando...',
    levelColor: 'gray',
    confidence: 0,
    breakdown: [],
    missingExams: []
  })
  const [stats, setStats] = useState({
    exams: 0,
    medications: 0,
    cards: 0,
    family: 0
  })
  const [loading, setLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showExamPrompt, setShowExamPrompt] = useState(false)
  const [justOnboarded, setJustOnboarded] = useState(false)

  useEffect(() => {
    loadDashboardData()
  }, [user])

  const loadDashboardData = async () => {
    if (!user) return

    try {
      // Verificar se onboarding foi completado
      const profileData =
  localStorage.getItem(`healthwallet_profile_${user.id}`) ||
  localStorage.getItem('healthwallet_profile')

      // Verificar se acabou de fazer onboarding
      const onboardingCompleted = localStorage.getItem(`healthwallet_onboarding_completed_${user.id}`)
      if (onboardingCompleted === 'true') {
        setJustOnboarded(true)
        setShowExamPrompt(true)
        localStorage.removeItem(`healthwallet_onboarding_completed_${user.id}`)
      }

      let profile: any = null

if (profileData) {
  profile = JSON.parse(profileData)
} else {
  const { data: dbProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (!dbProfile) {
    window.location.href = '/onboarding'
    return
  }

  profile = {
    birthDate: dbProfile.birth_date,
    gender: dbProfile.gender,
    weight: dbProfile.weight,
    height: dbProfile.height,
    bloodType: dbProfile.blood_type,
    smokingStatus: dbProfile.smoking_status,
    alcoholConsumption: dbProfile.alcohol_consumption,
    physicalActivity: dbProfile.physical_activity,
    sleepHours: dbProfile.sleep_hours,
    stressLevel: dbProfile.stress_level,
    allergies: dbProfile.allergies,
    chronicConditions: dbProfile.chronic_conditions,
    familyHistory: dbProfile.family_history,
    currentMedications: dbProfile.current_medications,
    medScore: dbProfile.med_score,
  }

  localStorage.setItem(
    `healthwallet_profile_${user.id}`,
    JSON.stringify(profile)
  )
}

      // Carregar dados do Supabase
      const [examsRes, medsRes, cardsRes, familyRes, conditionsRes, recordsFullRes] = await Promise.all([
  supabase.from('medical_records').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  supabase.from('medications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', true),
  supabase.from('health_plans').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  supabase.from('family_members').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  supabase.from('patient_conditions').select('*').eq('user_id', user.id),
  supabase.from('medical_records').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
])

      setStats({
        exams: examsRes.count || 0,
        medications: medsRes.count || 0,
        cards: cardsRes.count || 0,
        family: familyRes.count || 0
      })

const calculated = calculateMedScore(
  profile,
  recordsFullRes.data || [],
  conditionsRes.data || []
)

await supabase.from('health_scores').insert({
  user_id: user.id,
  score: calculated.score,
  status: calculated.level,
  factors: {
    confidence: calculated.confidence,
    levelColor: calculated.levelColor,
    missingExams: calculated.missingExams,
    alerts: calculated.alerts,
    breakdown: calculated.breakdown,
    calculatedFrom: ['profile', 'lifestyle', 'real_exams', 'conditions'],
  },
  calculated_at: new Date().toISOString(),
})
      
      setMedScore(calculated)
      
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
                   user?.email?.split('@')[0] ||
                   'Usuário'

  const scoreColorClass = {
    emerald: 'text-emerald-600',
    teal: 'text-teal-600',
    yellow: 'text-yellow-600',
    red: 'text-red-600',
    gray: 'text-gray-600'
  }[medScore.levelColor]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-20">
      {/* MedScore Card */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-5 text-white relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative">
          <div className="flex items-center gap-4">
            <div className="relative">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="10" />
                <circle
                  cx="50" cy="50" r="40" fill="none"
                  stroke="white" strokeWidth="10"
                  strokeDasharray={`${(medScore.score / 100) * 251.2} 251.2`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold">{medScore.score}</span>
                <span className="text-xs opacity-80">/100</span>
              </div>
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4" />
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider">MedScore</p>
              </div>
              <p className="text-xl font-bold">{medScore.level}</p>
              <p className="text-white/80 text-sm mb-2">Olá, {userName}!</p>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-300" />
                <span className="text-xs text-white/70">
                  {medScore.confidence}% completo
                </span>
              </div>
            </div>
          </div>

          <a
  href="/chat?context=score"
  className="mt-3 block w-full text-center bg-purple-600 text-white py-3 rounded-xl font-medium"
>
  Conversar sobre meu HealthScore
</a>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            <Link
              to="/onboarding"
              className="flex-1 flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Stethoscope className="w-4 h-4" />
              Atualizar Dados
            </Link>
            <Link
              to="/share"
              className="flex-1 flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <QrCode className="w-4 h-4" />
              Compartilhar
            </Link>
          </div>
        </div>
      </div>

      {/* Missing Exams Alert */}
      {medScore.missingExams.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-sm text-yellow-900">Exames Pendentes</p>
              <p className="text-xs text-yellow-700 mt-1 mb-3">
                Para melhorar seu MedScore, você precisa fazer:
              </p>
              <div className="flex flex-wrap gap-2">
                {medScore.missingExams.map((exam) => (
                  <span key={exam} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                    {exam}
                  </span>
                ))}
              </div>
              <Link
                to="/upload"
                className="inline-flex items-center gap-1 mt-3 text-xs text-yellow-800 font-medium"
              >
                <Camera className="w-3 h-3" />
                Upload de Exames
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* First-time Exam Request Modal */}
      {showExamPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <Stethoscope className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold mb-2">
                {justOnboarded ? 'Parabéns pelo Onboarding!' : 'Hora de Melhorar seu MedScore!'}
              </h2>
              <p className="text-gray-600 text-sm">
                {justOnboarded
                  ? 'Você completou seu perfil! Agora vamos calcular seu MedScore com exames reais.'
                  : 'Para calcular seu MedScore com precisão, você precisa enviar seus exames.'}
              </p>
            </div>

            <div className="bg-emerald-50 rounded-xl p-4 mb-6">
              <p className="text-sm font-medium text-emerald-900 mb-3">Exames Recomendados:</p>
              <div className="space-y-2">
                {[
                  { name: 'Hemograma Completo', icon: '🩸' },
                  { name: 'Perfil Lipídico', icon: '❤️' },
                  { name: 'Glicemia de Jejum', icon: '📊' },
                  { name: 'PCR Ultrasensível', icon: '🔬' },
                ].map((exam, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span>{exam.icon}</span>
                    <span className="text-emerald-800">{exam.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowExamPrompt(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Mais tarde
              </button>
              <Link
                to="/upload"
                className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors text-center flex items-center justify-center gap-2"
              >
                <Camera className="w-5 h-5" />
                Enviar Exames
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Ações Rápidas</h2>
        <div className="grid grid-cols-3 gap-2">
          <QuickAction icon={Camera} label="Exame" color="bg-violet-600" href="/upload" />
          <QuickAction icon={MessageCircle} label="Chat" color="bg-blue-600" href="/chat" />
          <QuickAction icon={QrCode} label="QR Code" color="bg-teal-600" href="/wallet" />
          <QuickAction
  icon={FileText}
  label="Resumo"
  color="bg-emerald-600"
  href="/summary"
/>

<QuickAction
  icon={Calendar}
  label="Timeline"
  color="bg-indigo-600"
  href="/timeline"
/>

<QuickAction
  icon={Shield}
  label="Passport"
  color="bg-red-600"
  href="/passport"
/>
        </div>
      </div>

      {/* Stats */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Seu Cofre de Saúde</h2>
        <div className="grid grid-cols-4 gap-2">
          <StatCard icon={Activity} value={stats.exams} label="Exames" color="bg-blue-100 text-blue-600" />
          <StatCard icon={Pill} value={stats.medications} label="Remédios" color="bg-orange-100 text-orange-600" />
          <StatCard icon={FileText} value={stats.cards} label="Carteirinhas" color="bg-purple-100 text-purple-600" />
          <StatCard icon={Users} value={stats.family} label="Família" color="bg-green-100 text-green-600" />
        </div>
      </div>

      {/* Menu */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <MenuItem icon={QrCode} label="Carteirinha de Saúde" href="/wallet" />
        <MenuItem icon={Calendar} label="Calendário de Exames" href="/exams" />
        <MenuItem icon={Shield} label="Perfil de Emergência" href="/profile" />
        <MenuItem icon={Users} label="Membros da Família" href="/family" />
        <MenuItem icon={MessageCircle} label="Assistente de IA" href="/chat" last />
      </div>

      {/* Health Tips */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 border border-blue-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="font-medium text-sm text-gray-900">Dica de Saúde</p>
            <p className="text-xs text-gray-600 mt-1">
              Manter 7-8 horas de sono por noite pode melhorar seu MedScore em até 10 pontos!
            </p>
          </div>
        </div>
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
    <Link
      to={href}
      className="flex flex-col items-center gap-2 p-3 rounded-xl bg-card border border-border hover:bg-muted/50 active:scale-95 transition-all"
    >
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <span className="text-xs font-medium">{label}</span>
    </Link>
  )
}

function StatCard({ icon: Icon, value, label, color }: {
  icon: React.ElementType
  value: number
  label: string
  color: string
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-3 text-center">
      <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center mx-auto mb-2`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function MenuItem({ icon: Icon, label, href, last }: {
  icon: React.ElementType
  label: string
  href: string
  last?: boolean
}) {
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
