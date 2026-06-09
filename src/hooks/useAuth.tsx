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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | any | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadAuth = async () => {
      const nexaUser = localStorage.getItem('healthwallet_nexa_user')

      if (nexaUser) {
        setUser(JSON.parse(nexaUser))
        setSession(null)
        setLoading(false)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()

      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    }

    loadAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nexaUser = localStorage.getItem('healthwallet_nexa_user')

      if (nexaUser) {
        setUser(JSON.parse(nexaUser))
        setSession(null)
        setLoading(false)
        return
      }

      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithEmail = async (email: string, password: string) => {
    localStorage.removeItem('healthwallet_nexa_user')
    localStorage.removeItem('healthwallet_nexa_token')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    return { error: error as Error | null }
  }

  const signUpWithEmail = async (email: string, password: string, name: string) => {
    localStorage.removeItem('healthwallet_nexa_user')
    localStorage.removeItem('healthwallet_nexa_token')

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        },
      },
    })

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
