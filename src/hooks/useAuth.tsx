import { useContext, createContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextType {
  user: User | any | null
  session: Session | null
  loading: boolean
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>
  signUpWithEmail: (email: string, password: string, name: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signInWithEmail: async () => ({ error: null }),
  signUpWithEmail: async () => ({ error: null }),
  signOut: async () => {},
})

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

  useEffect(() => {
    const loadAuth = async () => {
      const nexaUser = localStorage.getItem('healthwallet_nexa_user')

      if (nexaUser) {
        const parsed = JSON.parse(nexaUser)
        setUser(parsed)
        setSession(null)
        setLoading(false)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()

      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)

      if (session?.user) void ensureUserProfile(session.user)
    }

    loadAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nexaUser = localStorage.getItem('healthwallet_nexa_user')

      if (nexaUser) {
        const parsed = JSON.parse(nexaUser)
        setUser(parsed)
        setSession(null)
        setLoading(false)
        return
      }

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

    if (data.user) await ensureUserProfile(data.user)

    return { error: error as Error | null }
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

    const { error } = await supabase.auth.signOut()
    if (error) console.error('Error signing out:', error)

    setUser(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithEmail, signUpWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
