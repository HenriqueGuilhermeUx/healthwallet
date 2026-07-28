import { useEffect, useState } from 'react'
import { Heart, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

const NEXA_API_URL = 'https://nexa-backend-p2u0.onrender.com/api/v1'
const SHOW_NEXA_LOGIN = import.meta.env.VITE_ENABLE_NEXA_LOGIN === 'true'

export default function Login() {
  const { user, loading: authLoading, signInWithEmail, signUpWithEmail } = useAuth()
  const navigate = useNavigate()
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [nexaLoading, setNexaLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const nexaToken = params.get('nexaToken')

    if (nexaToken) {
      loginWithNexaToken(nexaToken)
    }
  }, [])

  const loginWithNexaToken = async (nexaToken: string) => {
    setNexaLoading(true)
    setError('')

    try {
      const response = await fetch(`${NEXA_API_URL}/nexa-id/validate/${nexaToken}`)
      const data = await response.json()

      if (!data.success || !data.user) {
        setError('Token Nexa ID inválido ou expirado')
        return
      }

      localStorage.setItem('healthwallet_nexa_user', JSON.stringify(data.user))
      localStorage.setItem('healthwallet_nexa_token', nexaToken)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError('Erro ao entrar com Nexa ID')
    } finally {
      setNexaLoading(false)
    }
  }

  if (user) {
    const accepted = localStorage.getItem(`healthwallet_terms_${user.id}`) === 'true'
    return <Navigate to={accepted ? '/dashboard' : '/consent'} replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isSignUp) {
        if (!name.trim()) {
          setError('Por favor, informe seu nome')
          setLoading(false)
          return
        }
        const { error } = await signUpWithEmail(email, password, name)
        if (error) {
          setError(error.message)
        } else {
          setError('Conta criada. Vamos finalizar seu aceite de privacidade.')
        }
      } else {
        const { error } = await signInWithEmail(email, password)
        if (error) {
          setError(error.message)
        }
      }
    } catch (err) {
      setError('Ocorreu um erro inesperado')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-4 py-6">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl text-foreground">HealthWallet</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30">
            <Heart className="w-12 h-12 text-white" />
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-2 text-center">
            {isSignUp ? 'Criar sua conta' : 'Bem-vindo de volta!'}
          </h1>
          <p className="text-muted-foreground mb-6 text-center">
            {isSignUp
              ? 'Preencha seus dados para começar'
              : 'Entre para acessar sua carteira de saúde digital'
            }
          </p>

          {SHOW_NEXA_LOGIN && (
            <>
              <button
                type="button"
                onClick={() => setError('Abra o HealthWallet pelo app Nexa para entrar automaticamente com Nexa ID.')}
                disabled={nexaLoading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
              >
                {nexaLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-5 h-5" />
                )}
                <span>{nexaLoading ? 'Validando Nexa ID...' : 'Entrar com Nexa ID'}</span>
              </button>

              <div className="flex items-center gap-3 mb-5">
                <div className="h-px bg-gray-200 flex-1" />
                <span className="text-xs text-gray-400 font-medium">ou entre com e-mail</span>
                <div className="h-px bg-gray-200 flex-1" />
              </div>
            </>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="text-sm font-medium mb-1 block">Nome completo</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                  required={isSignUp}
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-1 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all pr-12"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {isSignUp && (
                <p className="text-xs text-muted-foreground mt-1">Mínimo de 6 caracteres</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || authLoading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              <span>{loading ? 'Aguarde...' : isSignUp ? 'Criar Conta' : 'Entrar'}</span>
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {isSignUp ? 'Já tem conta?' : 'Não tem conta?'}{' '}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError('')
              }}
              className="text-emerald-600 font-medium hover:underline"
            >
              {isSignUp ? 'Faça login' : 'Crie uma agora'}
            </button>
          </p>

          <p className="text-xs text-muted-foreground mt-6 text-center">
            Ao continuar, você concorda com nossos{' '}
            <Link to="/terms" className="underline">Termos de Uso</Link>
            {' '}e{' '}
            <Link to="/privacy" className="underline">Política de Privacidade</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
