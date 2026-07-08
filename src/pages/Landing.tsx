import {
  Heart,
  Shield,
  Brain,
  FileText,
  ArrowRight,
  CheckCircle,
  Users,
  Activity,
  Star,
  LogIn,
  Pill,
  AlertTriangle,
  Clock,
  Share2,
  Stethoscope,
  Smartphone,
  Lock,
  QrCode,
  CalendarDays,
  Video,
  MessageCircle,
  ReceiptText,
  CreditCard,
  Building2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export default function Landing() {
  const { user } = useAuth()

  const mainHref = user ? '/dashboard' : '/login'
  const mainText = user ? 'Ir para meu painel' : 'Começar gratuitamente'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
              <Heart className="w-5 h-5 text-white" />
            </div>
            <div className="font-bold text-xl text-foreground leading-tight">
              HealthWallet
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-emerald-700">Recursos</a>
            <a href="#teleconsulta" className="hover:text-emerald-700">Teleconsulta</a>
            <a href="#family" className="hover:text-emerald-700">Família</a>
            <a href="#professionals" className="hover:text-emerald-700">Profissionais</a>
            <a href="#pricing" className="hover:text-emerald-700">Planos</a>
          </div>

          <a
            href={user ? '/dashboard' : '/login'}
            className="px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            {user ? 'Painel' : 'Entrar'}
          </a>
        </div>
      </header>

      <section className="relative overflow-hidden px-4 py-14 md:py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-cyan-500/10" />
        <div className="absolute -right-24 top-24 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="absolute -left-24 bottom-10 h-72 w-72 rounded-full bg-teal-300/20 blur-3xl" />

        <div className="relative max-w-6xl mx-auto grid gap-10 md:grid-cols-[1.05fr_0.95fr] md:items-center">
          <div className="text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 text-emerald-700 text-sm font-medium mb-6">
              <Shield className="w-4 h-4" />
              Cofre inteligente de saúde pessoal e familiar
            </div>

            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-5">
              Cuide da sua saúde e da sua família em um só lugar.
            </h1>

            <p className="text-muted-foreground text-lg md:text-xl mb-8 max-w-2xl mx-auto md:mx-0">
              Organize exames, medicamentos, MedScore, Passport de emergência, histórico, família, teleconsultas e compartilhamento seguro com profissionais.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
              <a
                href={mainHref}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
              >
                {mainText}
                <ArrowRight className="w-4 h-4" />
              </a>

              {!user && (
                <a
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-emerald-200 text-emerald-700 font-semibold hover:bg-emerald-50 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  Já tenho conta
                </a>
              )}
            </div>

            <div className="mt-8 grid grid-cols-3 gap-3 max-w-xl mx-auto md:mx-0">
              <ProofItem value="Grátis" label="para pacientes" />
              <ProofItem value="IA" label="resumos e exames" />
              <ProofItem value="SOS" label="ajuda rápida" />
            </div>
          </div>

          <div className="mx-auto w-full max-w-sm">
            <div className="rounded-[2.4rem] border bg-slate-950 p-3 shadow-2xl">
              <div className="rounded-[2rem] bg-white overflow-hidden">
                <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <p className="text-white/70 text-xs">HealthWallet</p>
                      <h3 className="text-xl font-bold">Dashboard</h3>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center">
                      <Heart className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="rounded-3xl bg-white/15 p-4 backdrop-blur">
                    <p className="text-sm text-white/75 mb-1">MedScore</p>
                    <div className="flex items-end gap-2">
                      <span className="text-5xl font-bold">82</span>
                      <span className="text-white/70 pb-2">/100</span>
                    </div>
                    <p className="text-xs text-white/75 mt-2">Resumo inteligente atualizado</p>
                  </div>
                </div>

                <div className="p-5 space-y-3">
                  <PhoneCard icon={Video} title="Teleconsulta hoje" description="Confirmar e entrar na chamada" />
                  <PhoneCard icon={Pill} title="Losartana 08:00" description="Confirmar medicamento" />
                  <PhoneCard icon={Users} title="Círculo de cuidado" description="Família e cuidadores conectados" />
                  <PhoneCard icon={AlertTriangle} title="Ajuda Rápida" description="Contatos, localização e Passport" danger />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-14 px-4 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-3xl font-bold mb-3">Tudo que a nova HealthWallet entrega</h2>
            <p className="text-muted-foreground">
              Uma experiência simples para o paciente, poderosa para famílias e útil para profissionais de saúde autorizados.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard icon={Activity} title="Dashboard diário" description="Visão rápida de MedScore, próximos lembretes, exames, consultas e histórico." color="bg-emerald-600" />
            <FeatureCard icon={Brain} title="IA para exames" description="Resumos em linguagem simples e versão profissional para compartilhar com médicos." color="bg-purple-600" />
            <FeatureCard icon={Pill} title="Medicamentos" description="Lembretes, botão Tomei/Adiar/Pulei, estoque e alertas para cuidadores." color="bg-blue-600" />
            <FeatureCard icon={Video} title="Teleconsulta" description="Consulta online com confirmação do paciente e compartilhamento de dados por evento." color="bg-cyan-600" />
            <FeatureCard icon={AlertTriangle} title="Ajuda Rápida / SOS" description="Botão de emergência com contatos, localização e dados críticos do Passport." color="bg-red-600" />
            <FeatureCard icon={Users} title="Família e idosos" description="Círculo de cuidado com familiar master, cuidadores e acompanhamento remoto." color="bg-indigo-600" />
            <FeatureCard icon={Share2} title="Compartilhamento seguro" description="Código temporário e permissões para acessar exames, resumo, timeline e Passport." color="bg-teal-600" />
            <FeatureCard icon={ReceiptText} title="Receitas e orientações" description="Envio de receitas, documentos e orientações pós-consulta pelo profissional responsável." color="bg-orange-600" />
            <FeatureCard icon={Smartphone} title="App Android" description="Preparado para distribuição pela Google Play com experiência mobile." color="bg-slate-700" />
          </div>
        </div>
      </section>

      <section id="teleconsulta" className="py-14 px-4">
        <div className="max-w-6xl mx-auto grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-50 text-cyan-700 text-sm font-medium mb-5">
              <Video className="w-4 h-4" />
              Teleconsulta simples e segura
            </div>
            <h2 className="text-3xl font-bold mb-4">O paciente só confirma, autoriza e entra.</h2>
            <p className="text-muted-foreground text-lg mb-6">
              A consulta fica integrada ao histórico do paciente. Para cada evento, ele pode autorizar o compartilhamento de resumo, exames, medicamentos, timeline e Passport com o profissional.
            </p>
            <div className="grid gap-3">
              <FlowStep number="1" title="Profissional agenda" description="Define data, horário, paciente e link da chamada." />
              <FlowStep number="2" title="Paciente confirma" description="Aceita a consulta e libera os dados necessários para aquele atendimento." />
              <FlowStep number="3" title="Consulta acontece" description="No horário, paciente e profissional entram na chamada e acessam as informações organizadas." />
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-6 shadow-sm">
            <h3 className="font-bold text-lg mb-4">Dados compartilhados por consulta</h3>
            <div className="grid gap-3">
              <PermissionRow title="Resumo IA" enabled />
              <PermissionRow title="Exames selecionados" enabled />
              <PermissionRow title="Medicamentos em uso" enabled />
              <PermissionRow title="Timeline de saúde" enabled />
              <PermissionRow title="Passport de emergência" enabled />
            </div>
          </div>
        </div>
      </section>

      <section id="family" className="py-14 px-4 bg-muted/30">
        <div className="max-w-6xl mx-auto grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium mb-5">
              <Users className="w-4 h-4" />
              HealthWallet Família
            </div>
            <h2 className="text-3xl font-bold mb-4">Cuide dos seus pais à distância, com mais segurança.</h2>
            <p className="text-muted-foreground text-lg mb-6">
              Familiares e cuidadores podem acompanhar medicamentos, alertas, exames, Passport e eventos importantes, sem depender de mensagens soltas no WhatsApp.
            </p>
            <div className="space-y-3">
              <BenefitItem title="Acesso master para familiares" description="Permissões familiares permanentes, separadas do acesso temporário para profissionais externos." />
              <BenefitItem title="Alertas de rotina" description="Medicamentos, estoque baixo, consultas, exames e eventos importantes." />
              <BenefitItem title="Modo cuidador" description="Registro de confirmações, observações e troca de informações entre responsáveis." />
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg">Círculo de cuidado</h3>
              <span className="text-xs rounded-full bg-emerald-100 text-emerald-700 px-3 py-1">Ativo</span>
            </div>
            <div className="space-y-3">
              <CareRow title="Pai • 74 anos" subtitle="Medicamentos e emergência monitorados" badge="Paciente" />
              <CareRow title="Ana • filha" subtitle="Acesso master familiar" badge="Master" />
              <CareRow title="Carlos • cuidador" subtitle="Recebe alertas e registra rotina" badge="Cuidador" />
            </div>
          </div>
        </div>
      </section>

      <section id="professionals" className="py-14 px-4 bg-emerald-950 text-white">
        <div className="max-w-6xl mx-auto grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-emerald-100 text-sm font-medium mb-5">
              <Stethoscope className="w-4 h-4" />
              MyDataMed para profissionais
            </div>
            <h2 className="text-3xl font-bold mb-4">Agenda, teleconsulta, dados do paciente e relacionamento em uma plataforma simples.</h2>
            <p className="text-emerald-50/80 text-lg mb-6">
              Feito para pequenas clínicas, profissionais liberais, consultórios e equipes que querem atender melhor sem montar uma operação complexa.
            </p>
            <a
              href="https://mydatamed.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-white text-emerald-800 px-5 py-3 font-semibold hover:bg-emerald-50 transition-colors"
            >
              Acessar MyDataMed
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          <div className="rounded-3xl bg-white/10 border border-white/10 p-6 backdrop-blur">
            <div className="grid gap-3">
              <ProfessionalItem icon={CalendarDays} title="Agendar e confirmar" description="Crie consultas, confirme presença e acompanhe status." />
              <ProfessionalItem icon={Video} title="Iniciar teleconsulta" description="Use chamada por link e conecte o atendimento ao histórico do paciente." />
              <ProfessionalItem icon={MessageCircle} title="Lembretes e relacionamento" description="Envie lembretes, orientações e acompanhe o paciente antes e depois da consulta." />
              <ProfessionalItem icon={ReceiptText} title="Receitas e documentos" description="Envie receitas, pedidos, orientações e documentos emitidos pelo profissional responsável." />
              <ProfessionalItem icon={Brain} title="Resumo profissional" description="Acesse informações essenciais autorizadas pelo paciente para acelerar o atendimento." />
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="py-14 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 text-emerald-700 text-sm font-medium mb-5">
              <Building2 className="w-4 h-4" />
              Modelo comercial simples
            </div>
            <h2 className="text-3xl font-bold mb-3">Paciente grátis. Profissional com plano acessível.</h2>
            <p className="text-muted-foreground">
              O módulo do paciente segue gratuito. A cobrança entra para profissionais e clínicas que usam agenda, teleconsulta, CRM, lembretes e pagamentos.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5 max-w-5xl mx-auto">
            <PricingCard
              title="Paciente"
              price="Grátis"
              description="Para organizar saúde pessoal e familiar."
              items={[
                'Exames, documentos e histórico',
                'MedScore e resumo com IA',
                'Medicamentos e lembretes',
                'Família, cuidadores e SOS',
                'Compartilhamento seguro com profissionais',
              ]}
              cta="Começar gratuitamente"
              href={mainHref}
            />

            <PricingCard
              featured
              title="Profissional / Clínica"
              price="R$ 79,90/mês"
              description="Para atender, acompanhar e monetizar teleconsultas."
              items={[
                'Agenda de teleconsultas',
                'Confirmação e lembretes de consulta',
                'Iniciar consulta por vídeo/link',
                'Dados do paciente compartilhados por evento',
                'Envio de receitas, orientações e documentos',
                'CRM simples para relacionamento com pacientes',
                'Pagamentos Pix e repasses em evolução',
              ]}
              cta="Conhecer MyDataMed"
              href="https://mydatamed.com"
            />
          </div>

          <div className="mt-8 rounded-3xl border bg-muted/30 p-5 max-w-5xl mx-auto">
            <div className="grid md:grid-cols-3 gap-4">
              <RoadmapItem icon={CreditCard} title="Pagamentos NextGen" description="Pix, confirmação de pagamento, comissão e repasse para o profissional." />
              <RoadmapItem icon={MessageCircle} title="SmartBots CRM" description="Lembretes, follow-up, retorno pós-consulta e automações para pequenas clínicas." />
              <RoadmapItem icon={Shield} title="Consentimento por evento" description="O paciente controla quais dados serão usados em cada consulta." />
            </div>
          </div>
        </div>
      </section>

      <section className="py-14 px-4 bg-gradient-to-br from-emerald-600 to-teal-700 text-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            {user ? 'Acesse seu painel de saúde' : 'Comece gratuitamente e monte seu cofre de saúde.'}
          </h2>
          <p className="text-white/80 text-lg mb-7">
            HealthWallet é uma ferramenta de organização e apoio informativo. Não substitui consulta médica, diagnóstico profissional ou atendimento de emergência.
          </p>
          <a
            href={mainHref}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-white text-emerald-700 font-semibold hover:bg-white/90 transition-colors"
          >
            <Star className="w-4 h-4" />
            {user ? 'Abrir painel' : 'Criar conta grátis'}
          </a>
        </div>
      </section>

      <footer className="py-8 px-4 border-t bg-muted/20">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>HealthWallet - Cofre inteligente de saúde pessoal e familiar.</p>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <a href="/privacy" className="hover:text-emerald-700">Privacidade</a>
            <a href="/delete-account" className="hover:text-emerald-700">Excluir conta</a>
            <span>LGPD | Dados seguros</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function ProofItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3 text-center">
      <div className="font-bold text-emerald-700">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function PhoneCard({ icon: Icon, title, description, danger }: {
  icon: React.ElementType
  title: string
  description: string
  danger?: boolean
}) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-3 ${danger ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${danger ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h4 className="text-sm font-semibold">{title}</h4>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
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
    <div className="bg-card rounded-2xl p-5 border border-border shadow-sm hover:shadow-md transition-shadow">
      <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center mb-4`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <h3 className="font-semibold text-base mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
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
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

function CareRow({ title, subtitle, badge }: { title: string; subtitle: string; badge: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border bg-background p-4">
      <div>
        <h4 className="font-semibold">{title}</h4>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <span className="text-xs rounded-full bg-emerald-100 text-emerald-700 px-3 py-1 font-medium">{badge}</span>
    </div>
  )
}

function ProfessionalItem({ icon: Icon, title, description }: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white/10 p-4 border border-white/10">
      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-emerald-100 flex-shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h4 className="font-semibold">{title}</h4>
        <p className="text-sm text-emerald-50/75 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

function FlowStep({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex gap-3 rounded-2xl border bg-card p-4">
      <div className="w-9 h-9 rounded-full bg-cyan-100 text-cyan-700 flex items-center justify-center font-bold flex-shrink-0">
        {number}
      </div>
      <div>
        <h4 className="font-semibold">{title}</h4>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

function PermissionRow({ title, enabled }: { title: string; enabled?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border bg-background p-4">
      <span className="font-medium text-sm">{title}</span>
      <span className={`text-xs rounded-full px-3 py-1 font-medium ${enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
        {enabled ? 'Autorizado' : 'Bloqueado'}
      </span>
    </div>
  )
}

function PricingCard({ title, price, description, items, cta, href, featured }: {
  title: string
  price: string
  description: string
  items: string[]
  cta: string
  href: string
  featured?: boolean
}) {
  return (
    <div className={`rounded-3xl border p-6 shadow-sm ${featured ? 'bg-emerald-950 text-white border-emerald-800' : 'bg-card'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold">{title}</h3>
        {featured && <span className="text-xs rounded-full bg-white/10 px-3 py-1 text-emerald-100">Profissionais</span>}
      </div>
      <div className="mb-2">
        <span className="text-4xl font-bold">{price}</span>
      </div>
      <p className={`text-sm mb-6 ${featured ? 'text-emerald-50/75' : 'text-muted-foreground'}`}>{description}</p>
      <div className="space-y-3 mb-6">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2 text-sm">
            <CheckCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${featured ? 'text-emerald-200' : 'text-emerald-600'}`} />
            <span className={featured ? 'text-emerald-50/90' : 'text-muted-foreground'}>{item}</span>
          </div>
        ))}
      </div>
      <a
        href={href}
        target={href.startsWith('http') ? '_blank' : undefined}
        rel={href.startsWith('http') ? 'noreferrer' : undefined}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold transition-colors ${featured ? 'bg-white text-emerald-800 hover:bg-emerald-50' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
      >
        {cta}
        <ArrowRight className="w-4 h-4" />
      </a>
    </div>
  )
}

function RoadmapItem({ icon: Icon, title, description }: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-card border p-4">
      <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h4 className="font-semibold text-sm">{title}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed mt-1">{description}</p>
      </div>
    </div>
  )
}
