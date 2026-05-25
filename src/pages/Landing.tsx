import { Heart, Shield, QrCode, Brain, FileText, Wallet, ArrowRight, CheckCircle, Users, Activity, Star } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export default function Landing() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Heart className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl text-foreground">HealthWallet</span>
          </div>
          {!user && (
            <a
              href="/login"
              className="px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              Entrar
            </a>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative py-12 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-teal-500/10" />
        <div className="relative max-w-md mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 text-emerald-700 text-sm font-medium mb-6">
            <Shield className="w-4 h-4" />
            Seus dados, seu controle
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Sua saúde,<br />
            <span className="text-emerald-600">seus dados,</span><br />
            seu controle.
          </h1>
          <p className="text-muted-foreground text-lg mb-8 max-w-sm mx-auto">
            Wallet de saúde digital com carteirinha do plano, análise de exames por IA e muito mais.
          </p>
          <div className="flex flex-col gap-3 max-w-xs mx-auto">
            <a
              href="/login"
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
            >
              Começar Gratuitamente
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="#features"
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-border text-foreground font-medium hover:bg-muted transition-colors"
            >
              Saiba mais
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-12 px-4 bg-muted/30">
        <div className="max-w-md mx-auto">
          <h2 className="text-xl font-bold text-center mb-8">Tudo que você precisa</h2>
          <div className="grid grid-cols-2 gap-4">
            <FeatureCard
              icon={Wallet}
              title="Wallet de Saúde"
              description="Carteirinha do plano de saúde ou SUS digital"
              color="bg-blue-600"
            />
            <FeatureCard
              icon={QrCode}
              title="QR Code"
              description="Check-in rápido na clínica com QR Code"
              color="bg-teal-600"
            />
            <FeatureCard
              icon={Brain}
              title="IA Análise"
              description="Traduz seus exames em linguagem simples"
              color="bg-purple-600"
            />
            <FeatureCard
              icon={FileText}
              title="Exames"
              description="Guarde todos seus exames em um só lugar"
              color="bg-orange-600"
            />
            <FeatureCard
              icon={Activity}
              title="Métricas"
              description="Acompanhe sua saúde com dashboards"
              color="bg-pink-600"
            />
            <FeatureCard
              icon={Users}
              title="Família"
              description="Gerencie saúde de toda a família"
              color="bg-indigo-600"
            />
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-12 px-4">
        <div className="max-w-md mx-auto">
          <h2 className="text-xl font-bold text-center mb-8">Por que usar o HealthWallet?</h2>
          <div className="space-y-4">
            <BenefitItem
              title="Seguro e Privado"
              description="Seus dados são criptografados. Você controla quem acessa."
            />
            <BenefitItem
              title="100% Gratuito"
              description="Recursos básicos são gratuitos para sempre."
            />
            <BenefitItem
              title="IA que Entende"
              description="Explicamos seus exames em palavras simples."
            />
            <BenefitItem
              title="Offline"
              description="Funciona mesmo sem internet."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 px-4 bg-gradient-to-br from-emerald-600 to-teal-700 text-white">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-2xl font-bold mb-4">Pronto para controlar sua saúde?</h2>
          <p className="text-white/80 mb-6">Crie sua conta gratuita em segundos.</p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-white text-emerald-700 font-semibold hover:bg-white/90 transition-colors"
          >
            <Star className="w-4 h-4" />
            Criar Conta Grátis
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t">
        <div className="max-w-md mx-auto text-center text-sm text-muted-foreground">
          <p className="mb-2">HealthWallet - Sua saúde, seus dados, seu controle.</p>
          <p>LGPD Compliant | Dados seguros</p>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ icon: Icon, title, description, color }: {
  icon: React.ElementType
  title: string
  description: string
  color: string
}) {
  return (
    <div className="bg-card rounded-xl p-4 border border-border">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <h3 className="font-semibold text-sm mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

function BenefitItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border">
      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
        <CheckCircle className="w-4 h-4 text-emerald-600" />
      </div>
      <div>
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  )
}