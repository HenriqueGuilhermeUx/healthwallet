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

          {/* Protected routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Dashboard />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/wallet"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <HealthWallet />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/exams"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Exams />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/upload"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <UploadExam />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/translator"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <ExamTranslator />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/medications"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Medications />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/family"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Family />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
  path="/profile"
  element={
    <ProtectedRoute>
      <AppLayout>
        <Profile />
      </AppLayout>
    </ProtectedRoute>
  }
/>

<Route
  path="/consent"
  element={
    <ProtectedRoute>
      <AppLayout>
        <Consent />
      </AppLayout>
    </ProtectedRoute>
  }
/>

<Route
  path="/chat"
  element={
    <ProtectedRoute>
      <AppLayout>
        <Chat />
      </AppLayout>
    </ProtectedRoute>
  }
/>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />

          {/* Public pages - Terms and Privacy */}
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
        </Routes>
        <Toaster position="top-center" richColors />
      </AuthProvider>
    </BrowserRouter>
  )
}
