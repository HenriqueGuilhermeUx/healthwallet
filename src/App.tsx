import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { Toaster } from 'sonner'

// Pages
import Landing from '@/pages/Landing'
import Dashboard from '@/pages/Dashboard'
import HealthWallet from '@/pages/HealthWallet'
import Exams from '@/pages/Exams'
import UploadExam from '@/pages/UploadExam'
import ExamTranslator from '@/pages/ExamTranslator'
import Medications from '@/pages/Medications'
import Family from '@/pages/Family'
import Profile from '@/pages/Profile'
import Login from '@/pages/Login'
import Onboarding from '@/pages/Onboarding'
import ShareQRCode from '@/pages/ShareQRCode'
import ReceivedDocuments from '@/pages/ReceivedDocuments'
import Chat from '@/pages/Chat'
import Terms from '@/pages/Terms'
import Privacy from '@/pages/Privacy'
import Consent from '@/pages/Consent'
import AccessCode from '@/pages/AccessCode'
import Passport from '@/pages/Passport'
import Summary from '@/pages/Summary'
import Timeline from '@/pages/Timeline'
import WomensHealth from '@/pages/WomensHealth'
import MedScore from '@/pages/MedScore'

// Components
import BottomNav from '@/components/BottomNav'
import AppHeader from '@/components/AppHeader'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
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

  return <>{children}</>
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader />
      <main className="px-4 py-4 max-w-md mx-auto">
        {children}
      </main>
      <BottomNav />
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/share" element={<ShareQRCode />} />
          <Route path="/access/:code" element={<AccessCode />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />

          {/* Protected routes */}
          <Route path="/dashboard" element={<ProtectedPage><Dashboard /></ProtectedPage>} />
          <Route path="/wallet" element={<ProtectedPage><HealthWallet /></ProtectedPage>} />
          <Route path="/exams" element={<ProtectedPage><Exams /></ProtectedPage>} />
          <Route path="/upload" element={<ProtectedPage><UploadExam /></ProtectedPage>} />
          <Route path="/translator" element={<ProtectedPage><ExamTranslator /></ProtectedPage>} />
          <Route path="/medications" element={<ProtectedPage><Medications /></ProtectedPage>} />
          <Route path="/family" element={<ProtectedPage><Family /></ProtectedPage>} />
          <Route path="/profile" element={<ProtectedPage><Profile /></ProtectedPage>} />
          <Route path="/consent" element={<ProtectedPage><Consent /></ProtectedPage>} />
          <Route path="/chat" element={<ProtectedPage><Chat /></ProtectedPage>} />
          <Route path="/passport" element={<ProtectedPage><Passport /></ProtectedPage>} />
          <Route path="/summary" element={<ProtectedPage><Summary /></ProtectedPage>} />
          <Route path="/timeline" element={<ProtectedPage><Timeline /></ProtectedPage>} />
          <Route path="/documents" element={<ProtectedPage><ReceivedDocuments /></ProtectedPage>} />
          <Route path="/womens-health" element={<ProtectedPage><WomensHealth /></ProtectedPage>} />
          <Route path="/medscore" element={<ProtectedPage><MedScore /></ProtectedPage>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <Toaster position="top-center" richColors />
      </AuthProvider>
    </BrowserRouter>
  )
}
