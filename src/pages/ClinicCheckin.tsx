import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowRight,
  CheckCircle,
  ClipboardCheck,
  ExternalLink,
  FileText,
  HeartPulse,
  Lock,
  QrCode,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Users,
} from 'lucide-react'

export default function ClinicCheckin() {
  const [link, setLink] = useState('')

  function openCheckinLink() {
    const value = link.trim()
    if (!value) {
      toast.error('Cole o link ou QR Code da clínica')
      return
    }

    if (!/^https?:\/\//i.test(value)) {
      toast.error('Cole um link completo começando com https://')
      return
    }

    window.location.href = value
  }

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-emerald-900 to-blue-900 p-5 text-white overflow-hidden relative">
        <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-white/10" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-emerald-100 mb-4">
            <QrCode className="w-4 h-4" /> Check-in na clínica
          </div>
          <h1 className="text-3xl font-bold leading-tight">Faça sua entrada pelo celular.</h1>
          <p className="text-white/80 text-sm mt-3">
            Ao chegar em uma clínica parceira, escaneie o QR Code da recepção e preencha seus dados sozinho. A equipe recebe sua entrada organizada e chama você quando estiver pronto.
          </p>
        </div>
      </section>

      <section className="rounded-2xl bg-white border border-border p-4 space-y-3">
        <h2 className="font-bold flex items-center gap-2"><Smartphone className="w-5 h-5 text-emerald-600" /> Como usar</h2>
        <Step number="1" title="Escaneie o QR Code" text="A clínica exibe um QR Code na recepção, balcão, monitor ou tablet." />
        <Step number="2" title="Preencha seus dados" text="Informe nome, contato, motivo, plano/carteirinha quando houver e consentimentos." />
        <Step number="3" title="Entre na fila" text="Sua entrada aparece para a recepção conferir, sem papelada e sem repetir tudo no balcão." />
      </section>

      <section className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 space-y-3">
        <h2 className="font-bold text-emerald-950 flex items-center gap-2"><ClipboardCheck className="w-5 h-5" /> Recebeu um link da clínica?</h2>
        <p className="text-sm text-emerald-900/80">
          Cole abaixo o link de pré-atendimento ou check-in enviado por WhatsApp, e-mail ou lido por QR Code.
        </p>
        <input
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="https://.../pre-atendimento/..."
          className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        <button onClick={openCheckinLink} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 text-white py-3 font-semibold hover:bg-emerald-800">
          Abrir check-in
          <ExternalLink className="w-4 h-4" />
        </button>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Feature icon={ShieldCheck} title="Você autoriza" text="Dados só são enviados com consentimento." />
        <Feature icon={FileText} title="Menos papel" text="Entrada digital antes do atendimento." />
        <Feature icon={Users} title="Família" text="Ajuda dependentes e acompanhantes." />
        <Feature icon={HeartPulse} title="Continuidade" text="Depois, acompanhe tudo no HealthWallet." />
      </section>

      <section className="rounded-2xl bg-white border border-border p-4 space-y-3">
        <h2 className="font-bold flex items-center gap-2"><Lock className="w-5 h-5 text-blue-600" /> Segurança e privacidade</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <Check text="A clínica recebe apenas os dados necessários para organizar sua chegada." />
          <Check text="Dados de plano/carteirinha são usados para conferência administrativa quando você informar." />
          <Check text="O check-in não substitui avaliação, consulta ou orientação profissional." />
        </div>
      </section>

      <section className="rounded-2xl bg-slate-950 text-white p-4">
        <h2 className="font-bold flex items-center gap-2"><Stethoscope className="w-5 h-5 text-emerald-300" /> Para clínicas parceiras</h2>
        <p className="text-sm text-white/75 mt-2">
          O MyDataMed permite exibir QR Code de recepção, receber entradas automáticas e iniciar o atendimento com dados mais organizados.
        </p>
        <a href="https://mydatamed.com/recepcao-digital" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-200">
          Conhecer solução para clínicas <ArrowRight className="w-4 h-4" />
        </a>
      </section>

      <Link to="/wallet" className="block rounded-2xl bg-white border border-border p-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center"><HeartPulse className="w-6 h-6" /></div>
          <div className="flex-1">
            <p className="font-bold">Organize seus dados de saúde</p>
            <p className="text-sm text-muted-foreground">Exames, receitas, medicamentos e documentos ficam no seu HealthWallet.</p>
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground" />
        </div>
      </Link>
    </div>
  )
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-muted/40 p-3">
      <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">{number}</div>
      <div>
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{text}</p>
      </div>
    </div>
  )
}

function Feature({ icon: Icon, title, text }: any) {
  return (
    <div className="rounded-2xl bg-white border border-border p-4">
      <Icon className="w-6 h-6 text-emerald-600 mb-3" />
      <p className="font-bold text-sm">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{text}</p>
    </div>
  )
}

function Check({ text }: { text: string }) {
  return <div className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" /><span>{text}</span></div>
}
