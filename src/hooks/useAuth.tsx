import { useContext, createContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextType {
  user: User | any | null
  session: Session | null
  loading: boolean
  nexaLinkRequired: boolean
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>
  signUpWithEmail: (email: string, password: string, name: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  nexaLinkRequired: false,
  signInWithEmail: async () => ({ error: null }),
  signUpWithEmail: async () => ({ error: null }),
  signOut: async () => {},
})

const PENDING_NEXA_TOKEN_KEY = 'healthwallet_pending_nexa_token'

function readPendingNexaToken() {
  try {
    return String(window.sessionStorage.getItem(PENDING_NEXA_TOKEN_KEY) || '').trim()
  } catch {
    return ''
  }
}

function savePendingNexaToken(token: string) {
  try {
    window.sessionStorage.setItem(PENDING_NEXA_TOKEN_KEY, token)
  } catch {
    // The token remains in the current handoff only when storage is unavailable.
  }
}

function clearPendingNexaToken() {
  try {
    window.sessionStorage.removeItem(PENDING_NEXA_TOKEN_KEY)
  } catch {
    // Ignore browsers where sessionStorage is unavailable.
  }
}

type NexaHandoffError = Error & { code?: string; status?: number }

async function exchangeNexaToken(token: string, currentSession: Session | null = null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (currentSession?.access_token) {
    headers.Authorization = `Bearer ${currentSession.access_token}`
  }

  const response = await fetch('/api/nexa/session', {
    method: 'POST',
    headers,
    body: JSON.stringify({ token }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success !== true || !payload?.tokenHash) {
    const error = new Error(
      payload?.message || 'Nexa ID handoff unavailable',
    ) as NexaHandoffError
    error.code = String(payload?.error || 'nexa_handoff_unavailable')
    error.status = response.status
    throw error
  }

  clearPendingNexaToken()
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: String(payload.tokenHash),
    type: 'magiclink',
  })

  if (error || !data?.session?.user) {
    savePendingNexaToken(token)
    throw error || new Error('Health Wallet session exchange failed')
  }

  localStorage.removeItem('healthwallet_nexa_user')
  localStorage.removeItem('healthwallet_nexa_token')
  return data.session
}

async function exchangeNexaHandoff(currentSession: Session | null = null) {
  const params = new URLSearchParams(window.location.search)
  const token = String(params.get('nexaToken') || '').trim()
  if (!token) return null

  savePendingNexaToken(token)
  params.delete('nexaToken')
  params.delete('source')
  const nextQuery = params.toString()
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`,
  )

  return exchangeNexaToken(token, currentSession)
}

async function exchangePendingNexaHandoff(currentSession: Session) {
  const token = readPendingNexaToken()
  if (!token) return null
  return exchangeNexaToken(token, currentSession)
}

async function ensureUserProfile(user: User | any | null) {
  if (!user?.id) return

  try {
    await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
  } catch (error) {
    console.warn('Could not ensure profile after auth:', error)
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | any | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [nexaLinkRequired, setNexaLinkRequired] = useState(Boolean(readPendingNexaToken()))

  useEffect(() => {
    const loadAuth = async () => {
      const { data: { session: existingSession } } = await supabase.auth.getSession()

      try {
        const federatedSession = await exchangeNexaHandoff(existingSession)
        if (federatedSession) {
          setSession(federatedSession)
          setUser(federatedSession.user)
          setNexaLinkRequired(false)
          setLoading(false)
          void ensureUserProfile(federatedSession.user)
          return
        }
      } catch (error) {
        const handoffError = error as NexaHandoffError
        console.warn('Nexa ID handoff failed:', handoffError)
        setNexaLinkRequired(handoffError?.code === 'account_link_required')
      }

      // Remove the legacy local-only Nexa identity. A Nexa login is valid only
      // after it has been exchanged for a real Supabase session.
      localStorage.removeItem('healthwallet_nexa_user')
      localStorage.removeItem('healthwallet_nexa_token')

      setSession(existingSession)
      setUser(existingSession?.user ?? null)
      setLoading(false)

      if (existingSession?.user) void ensureUserProfile(existingSession.user)
    }

    loadAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)

      if (session?.user) void ensureUserProfile(session.user)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithEmail = async (email: string, password: string) => {
    localStorage.removeItem('healthwallet_nexa_user')
    localStorage.removeItem('healthwallet_nexa_token')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) return { error: error as Error | null }

    if (data.user) await ensureUserProfile(data.user)

    if (data.session && readPendingNexaToken()) {
      try {
        const federatedSession = await exchangePendingNexaHandoff(data.session)
        if (federatedSession) {
          setSession(federatedSession)
          setUser(federatedSession.user)
          setNexaLinkRequired(false)
          void ensureUserProfile(federatedSession.user)
        }
      } catch (linkError) {
        setNexaLinkRequired(true)
        return {
          error: linkError instanceof Error
            ? linkError
            : new Error('Não foi possível vincular seu Nexa ID agora.'),
        }
      }
    }

    return { error: null }
  }

  const signUpWithEmail = async (email: string, password: string, name: string) => {
    localStorage.removeItem('healthwallet_nexa_user')
    localStorage.removeItem('healthwallet_nexa_token')

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          full_name: name,
        },
      },
    })

    if (data.user) await ensureUserProfile(data.user)

    return { error: error as Error | null }
  }

  const signOut = async () => {
    localStorage.removeItem('healthwallet_nexa_user')
    localStorage.removeItem('healthwallet_nexa_token')
    clearPendingNexaToken()
    setNexaLinkRequired(false)

    const { error } = await supabase.auth.signOut()
    if (error) console.error('Error signing out:', error)

    setUser(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, nexaLinkRequired, signInWithEmail, signUpWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
