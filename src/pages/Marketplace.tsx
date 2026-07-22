import { AlertTriangle, CalendarDays, FlaskConical, Pill, ShieldCheck, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Marketplace() {
  return (
    <div className="space-y-5 pb-20">
      <section className="rounded-2xl bg-gradient-to-br from-emerald-700 to-cyan-800 p-5 text-white">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
            <FlaskConical className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Exames e serviços</h1>
            <p className="text-white/85 text-sm">Área em preparação para parceiros autorizados.</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Compras e agendamentos diretos estão temporariamente indisponíveis.</p>
            <p className="text-sm mt-1">
              Para evitar uma experiência incompleta, esta versão do app mostra apenas orientações e atalhos funcionais. A compra de medicamentos, exames e pagamentos será liberada quando os parceiros e fluxos regulatórios estiverem ativos.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <InfoCard
          icon={Upload}
          title="Enviar exame"
          text="Faça upload de PDF ou imagem para organizar seus documentos de saúde no HealthWallet."
          href="/upload"
          cta="Enviar exame"
        />
        <InfoCard
          icon={CalendarDays}
          title="Consulta online"
          text="Solicite ou acompanhe uma consulta online já criada."
          href="/telemedicine"
          cta="Abrir consultas"
        />
        <InfoCard
          icon={ShieldCheck}
          title="Profissionais autorizados"
          text="Controle quais profissionais podem acompanhar seus dados de forma contínua."
          href="/care-links"
          cta="Gerenciar acessos"
        />
      </section>

      <section className="rounded-xl bg-white border p-4 space-y-3">
        <div className="flex items-center gap-2 font-bold text-gray-900">
          <Pill className="w-5 h-5 text-orange-600" /> Medicamentos
        </div>
        <p className="text-sm text-muted-foreground">
          O HealthWallet pode organizar medicamentos cadastrados, lembretes e histórico informado pelo usuário. Ele não vende medicamentos nesta versão e não substitui orientação profissional.
        </p>
      </section>
    </div>
  )
}

function InfoCard({ icon: Icon, title, text, href, cta }: any) {
  return (
    <Link to={href} className="rounded-xl bg-white border p-4 flex items-start gap-3 hover:bg-emerald-50 transition-colors">
      <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-muted-foreground mt-1">{text}</p>
        <p className="text-sm font-semibold text-emerald-700 mt-3">{cta}</p>
      </div>
    </Link>
  )
}
