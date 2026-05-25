import { useState } from 'react'
import { Heart, Loader2, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Link } from 'react-router-dom'

export default function Login() {
  const { user, loading: authLoading, signInWithEmail, signUpWithEmail } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Form states
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  // Se já está logado, redireciona
  if (user) {
    window.location.href = '/dashboard'
    return null
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
          setError('')
          alert('Conta criada com sucesso! Verifique seu email para confirmar o cadastro.')
          setIsSignUp(false)
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
      {/* Header */}
      <header className="px-4 py-6">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl text-foreground">HealthWallet</span>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {/* Logo grande */}
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

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
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
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : null}
              <span>{loading ? 'Aguarde...' : isSignUp ? 'Criar Conta' : 'Entrar'}</span>
            </button>
          </form>

          {/* Toggle sign up / sign in */}
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

          {/* Info */}
          <p className="text-xs text-muted-foreground mt-6 text-center">
            Ao continuar, você concorda com nossos{' '}
            <a href="/terms" className="underline">Termos de Uso</a>
            {' '}e{' '}
            <a href="/privacy" className="underline">Política de Privacidade</a>
          </p>
        </div>
      </div>
    </div>
  )
}