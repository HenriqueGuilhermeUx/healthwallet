import { ArrowRight, FileText, Heart, Lock, Shield, Stethoscope, Upload, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export default function Landing() {
  const { user } = useAuth()
  const mainHref = user ? '/dashboard' : '/login'
  const mainText = user ? 'Abrir minha carteira' : 'Entrar ou criar conta'

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white text-foreground">
      <header className="px-5 pt-6 pb-3">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
              <Heart className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">HealthWallet</p>
              <p className="text-xs text-muted-foreground">Sua saúde organizada</p>
            </div>
          </div>

          <Link
            to={mainHref}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-88px)] max-w-md flex-col px-5 pb-10 pt-4">
        <section className="flex-1 rounded-[2rem] border border-emerald-100 bg-white p-6 shadow-sm">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <Shield className="h-4 w-4" />
            Cofre pessoal e familiar de saúde
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-gray-950">
            Seus exames, dados e cuidados em um só lugar.
          </h1>

          <p className="mt-4 text-base leading-relaxed text-gray-600">
            Guarde exames, acompanhe medicamentos, tenha um Passport de emergência e compartilhe informações com profissionais quando quiser.
          </p>

          <div className="mt-6 grid gap-3">
            <Link
              to={mainHref}
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 font-bold text-white shadow-sm"
            >
              {mainText}
              <ArrowRight className="h-5 w-5" />
            </Link>

            {!user && (
              <Link
                to="/login"
                className="flex items-center justify-center rounded-2xl border border-emerald-200 px-5 py-4 font-semibold text-emerald-700"
              >
                Criar conta grátis
              </Link>
            )}
          </div>

          <div className="mt-7 grid grid-cols-3 gap-2">
            <MiniCard icon={Upload} title="Exames" />
            <MiniCard icon={Stethoscope} title="Consulta" />
            <MiniCard icon={Users} title="Família" />
          </div>
        </section>

        <section className="mt-5 grid gap-3">
          <InfoRow
            icon={FileText}
            title="Resumo simples"
            description="Organize dados importantes sem excesso de telas antes do login."
          />
          <InfoRow
            icon={Lock}
            title="Você controla"
            description="Compartilhamento com profissional só quando você autorizar."
          />
        </section>
      </main>
    </div>
  )
}

function MiniCard({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="rounded-2xl bg-emerald-50 p-3 text-center text-emerald-800">
      <Icon className="mx-auto mb-2 h-5 w-5" />
      <p className="text-xs font-bold">{title}</p>
    </div>
  )
}

function InfoRow({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="font-bold text-gray-900">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">{description}</p>
      </div>
    </div>
  )
}
