import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { Toaster } from 'sonner'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

// Pages
import Landing from '@/pages/Landing'
import Dashboard from '@/pages/Dashboard'
import HealthWallet from '@/pages/HealthWallet'
import Exams from '@/pages/Exams'
import UploadExam from '@/pages/UploadExam'
import ExamInbox from '@/pages/ExamInbox'
import ExamTranslator from '@/pages/ExamTranslator'
import Medications from '@/pages/Medications'
import Prescriptions from '@/pages/Prescriptions'
import Genetics from '@/pages/Genetics'
import Family from '@/pages/Family'
import Profile from '@/pages/Profile'
import Login from '@/pages/Login'
import Onboarding from '@/pages/Onboarding'
import ShareQRCode from '@/pages/ShareQRCode'
import ReceivedDocuments from '@/pages/ReceivedDocuments'
import Chat from '@/pages/Chat'
import Terms from '@/pages/Terms'
import Privacy from '@/pages/Privacy'
import DeleteAccount from '@/pages/DeleteAccount'
import Consent from '@/pages/Consent'
import AccessCode from '@/pages/AccessCode'
import Passport from '@/pages/Passport'
import Summary from '@/pages/Summary'
import Timeline from '@/pages/Timeline'
import WomensHealth from '@/pages/WomensHealth'
import MedScore from '@/pages/MedScore'
import Marketplace from '@/pages/Marketplace'
import Telemedicine from '@/pages/Telemedicine'
import TelemedicineAdmin from '@/pages/TelemedicineAdmin'
import Emergency from '@/pages/Emergency'
import CareLinks from '@/pages/CareLinks'
import ClinicCheckin from '@/pages/ClinicCheckin'
import DeviceData from '@/pages/DeviceData'
import Concierge from '@/pages/Concierge'
import ConciergeRequest from '@/pages/ConciergeRequest'
import ConciergeRequests from '@/pages/ConciergeRequests'
import ConciergeRequestDetail from '@/pages/ConciergeRequestDetail'
import ConciergePlan from '@/pages/ConciergePlan'
import ConciergePrograms from '@/pages/ConciergePrograms'
import ConciergeTeam from '@/pages/ConciergeTeam'
import ConciergeAgenda from '@/pages/ConciergeAgenda'
import ConciergeHealth from '@/pages/ConciergeHealth'
import ConciergeFamily from '@/pages/ConciergeFamily'
import ConciergeOperations from '@/pages/ConciergeOperations'
import ConciergeCase from '@/pages/ConciergeCase'
import ConciergePilotDashboard from '@/pages/ConciergePilotDashboard'
import ConciergeRoster from '@/pages/ConciergeRoster'
import ConciergeConsent from '@/pages/ConciergeConsent'

// Components
import BottomNav from '@/components/BottomNav'
import AppHeader from '@/components/AppHeader'
import AppErrorBoundary from '@/components/AppErrorBoundary'
import ConciergeAccessGate from '@/components/ConciergeAccessGate'
import ConciergeProfessionalHeader from '@/components/ConciergeProfessionalHeader'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  const [checkingConsent, setCheckingConsent] = useState(true)
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function checkConsent() {
      if (!user) {
        if (!cancelled) setCheckingConsent(false)
        return
      }

      const professionalRoute = location.pathname.startsWith('/concierge/ops') || location.pathname === '/telemedicine-admin'
      if (professionalRoute) {
        if (!cancelled) {
          setAcceptedTerms(true)
          setCheckingConsent(false)
        }
        return
      }

      if (location.pathname === '/consent') {
        if (!cancelled) setCheckingConsent(false)
        return
      }

      const localAccepted = localStorage.getItem(`healthwallet_terms_${user.id}`)

      if (localAccepted === 'true') {
        if (!cancelled) {
          setAcceptedTerms(true)
          setCheckingConsent(false)
        }
        return
      }

      try {
        const { data } = await supabase
          .from('profiles')
          .select('accepted_terms')
          .eq('id', user.id)
          .maybeSingle()

        if (data?.accepted_terms) {
          localStorage.setItem(`healthwallet_terms_${user.id}`, 'true')
          if (!cancelled) setAcceptedTerms(true)
        } else if (!cancelled) {
          setAcceptedTerms(false)
        }
      } catch (error) {
        console.warn('Consent check skipped:', error)
        if (!cancelled) setAcceptedTerms(false)
      }

      if (!cancelled) setCheckingConsent(false)
    }

    setCheckingConsent(true)
    void checkConsent()

    return () => {
      cancelled = true
    }
  }, [user, location.pathname])

  if (loading || checkingConsent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-emerald-600 border-t-transparent animate-spin" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!acceptedTerms && location.pathname !== '/consent') {
    return <Navigate to="/consent" replace />
  }

  return <>{children}</>
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-background"
      style={{ paddingBottom: 'calc(8.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <AppHeader />
      <main className="px-5 py-5 max-w-md mx-auto overflow-x-hidden">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}

function ProfessionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <ConciergeProfessionalHeader />
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        {children}
      </main>
    </div>
  )
}

function ProtectedPage({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  )
}

function ProfessionalPage({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <ProfessionalLayout>{children}</ProfessionalLayout>
    </ProtectedRoute>
  )
}

function ConciergePatientPage({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedPage>
      <ConciergeAccessGate>{children}</ConciergeAccessGate>
    </ProtectedPage>
  )
}

function ConnectReturnBridge() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let disposed = false
    let removeListener: (() => void | Promise<void>) | null = null

    function handleUrl(rawUrl?: string | null) {
      if (!rawUrl) return

      try {
        const url = new URL(rawUrl)
        if (url.protocol !== 'healthwallet:' || url.hostname !== 'connect-complete') return

        const payload = {
          status: url.searchParams.get('connect_status') || 'success',
          state: url.searchParams.get('state') || null,
          provider: url.searchParams.get('provider') || null,
          days_synced: Number(url.searchParams.get('days_synced') || 0),
          message: url.searchParams.get('message') || null,
          received_at: new Date().toISOString(),
        }

        sessionStorage.setItem('healthwallet_connect_return', JSON.stringify(payload))
        navigate('/devices')
      } catch (error) {
        console.warn('HealthWallet Connect return URL ignored:', error)
      }
    }

    CapacitorApp.getLaunchUrl()
      .then((launch) => {
        if (!disposed) handleUrl(launch?.url)
      })
      .catch(() => undefined)

    Promise.resolve(CapacitorApp.addListener('appUrlOpen', ({ url }) => handleUrl(url)))
      .then((handle) => {
        if (disposed) {
          void handle.remove()
          return
        }
        removeListener = () => handle.remove()
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      if (removeListener) void removeListener()
    }
  }, [navigate])

  return null
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ConnectReturnBridge />

          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/share" element={<ShareQRCode />} />
            <Route path="/access/:code" element={<AccessCode />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/delete-account" element={<DeleteAccount />} />

            {/* Protected patient routes */}
            <Route path="/consent" element={<ProtectedPage><Consent /></ProtectedPage>} />
            <Route path="/dashboard" element={<ProtectedPage><Dashboard /></ProtectedPage>} />
            <Route path="/concierge/consent" element={<ProtectedPage><ConciergeConsent /></ProtectedPage>} />
            <Route path="/concierge" element={<ConciergePatientPage><Concierge /></ConciergePatientPage>} />
            <Route path="/concierge/health" element={<ConciergePatientPage><ConciergeHealth /></ConciergePatientPage>} />
            <Route path="/concierge/family" element={<ConciergePatientPage><ConciergeFamily /></ConciergePatientPage>} />
            <Route path="/concierge/request" element={<ConciergePatientPage><ConciergeRequest /></ConciergePatientPage>} />
            <Route path="/concierge/requests" element={<ConciergePatientPage><ConciergeRequests /></ConciergePatientPage>} />
            <Route path="/concierge/requests/:id" element={<ConciergePatientPage><ConciergeRequestDetail /></ConciergePatientPage>} />
            <Route path="/concierge/plan" element={<ConciergePatientPage><ConciergePlan /></ConciergePatientPage>} />
            <Route path="/concierge/programs" element={<ConciergePatientPage><ConciergePrograms /></ConciergePatientPage>} />
            <Route path="/concierge/team" element={<ConciergePatientPage><ConciergeTeam /></ConciergePatientPage>} />
            <Route path="/concierge/agenda" element={<ConciergePatientPage><ConciergeAgenda /></ConciergePatientPage>} />
            <Route path="/wallet" element={<ProtectedPage><HealthWallet /></ProtectedPage>} />
            <Route path="/devices" element={<ProtectedPage><DeviceData /></ProtectedPage>} />
            <Route path="/clinic-checkin" element={<ProtectedPage><ClinicCheckin /></ProtectedPage>} />
            <Route path="/exams" element={<ProtectedPage><Exams /></ProtectedPage>} />
            <Route path="/upload" element={<ProtectedPage><UploadExam /></ProtectedPage>} />
            <Route path="/exam-inbox" element={<ProtectedPage><ExamInbox /></ProtectedPage>} />
            <Route path="/prescriptions" element={<ProtectedPage><Prescriptions /></ProtectedPage>} />
            <Route path="/genetics" element={<ProtectedPage><Genetics /></ProtectedPage>} />
            <Route path="/translator" element={<ProtectedPage><ExamTranslator /></ProtectedPage>} />
            <Route path="/medications" element={<ProtectedPage><Medications /></ProtectedPage>} />
            <Route path="/family" element={<ProtectedPage><Family /></ProtectedPage>} />
            <Route path="/profile" element={<ProtectedPage><Profile /></ProtectedPage>} />
            <Route path="/chat" element={<ProtectedPage><Chat /></ProtectedPage>} />
            <Route path="/passport" element={<ProtectedPage><Passport /></ProtectedPage>} />
            <Route path="/summary" element={<ProtectedPage><Summary /></ProtectedPage>} />
            <Route path="/timeline" element={<ProtectedPage><Timeline /></ProtectedPage>} />
            <Route path="/documents" element={<ProtectedPage><ReceivedDocuments /></ProtectedPage>} />
            <Route path="/womens-health" element={<ProtectedPage><WomensHealth /></ProtectedPage>} />
            <Route path="/medscore" element={<ProtectedPage><MedScore /></ProtectedPage>} />
            <Route path="/marketplace" element={<ProtectedPage><Marketplace /></ProtectedPage>} />
            <Route path="/telemedicine" element={<ProtectedPage><Telemedicine /></ProtectedPage>} />
            <Route path="/emergency" element={<ProtectedPage><Emergency /></ProtectedPage>} />
            <Route path="/care-links" element={<ProtectedPage><CareLinks /></ProtectedPage>} />

            {/* MyDataMed / professional operations */}
            <Route path="/concierge/ops" element={<ProfessionalPage><ConciergeOperations /></ProfessionalPage>} />
            <Route path="/concierge/ops/case/:id" element={<ProfessionalPage><ConciergeCase /></ProfessionalPage>} />
            <Route path="/concierge/ops/pilot" element={<ProfessionalPage><ConciergePilotDashboard /></ProfessionalPage>} />
            <Route path="/concierge/ops/roster" element={<ProfessionalPage><ConciergeRoster /></ProfessionalPage>} />
            <Route path="/telemedicine-admin" element={<ProfessionalPage><TelemedicineAdmin /></ProfessionalPage>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>

          <Toaster position="top-center" richColors />
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  )
}
