import { ChevronLeft, Heart, Mail, ShieldCheck, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function DeleteAccount() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Link to="/" className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Voltar">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Heart className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold">HealthWallet</span>
          </div>
        </div>
      </div>

      <main className="max-w-lg mx-auto px-4 py-6">
        <div className="rounded-2xl bg-white border shadow-sm p-5 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold mb-3">Exclusão de conta e dados</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Esta página explica como solicitar a exclusão da sua conta HealthWallet e dos dados pessoais associados ao aplicativo.
          </p>
        </div>

        <section className="rounded-2xl bg-white border shadow-sm p-5 mb-5 space-y-3">
          <h2 className="text-lg font-semibold">Como solicitar a exclusão</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Envie um e-mail para nossa equipe usando o mesmo e-mail cadastrado no app. No assunto, escreva:
          </p>
          <div className="rounded-xl bg-gray-50 border p-3 text-sm font-medium">
            Solicitação de exclusão de conta HealthWallet
          </div>
          <a
            href="mailto:privacidade@healthwallet.com.br?subject=Solicita%C3%A7%C3%A3o%20de%20exclus%C3%A3o%20de%20conta%20HealthWallet"
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white font-semibold py-3 hover:bg-emerald-700 transition-colors"
          >
            <Mail className="w-5 h-5" />
            Enviar solicitação
          </a>
          <p className="text-xs text-muted-foreground">
            E-mail: privacidade@healthwallet.com.br
          </p>
        </section>

        <section className="rounded-2xl bg-white border shadow-sm p-5 mb-5 space-y-3">
          <h2 className="text-lg font-semibold">Dados que serão excluídos</h2>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            <li>Conta de usuário e dados cadastrais</li>
            <li>Perfil de saúde e informações pessoais</li>
            <li>Exames, documentos e arquivos enviados</li>
            <li>Medicamentos, lembretes, timeline e registros de uso</li>
            <li>Compartilhamentos, códigos de acesso e permissões vinculadas</li>
            <li>Dados de família, cuidadores e contatos cadastrados pelo usuário</li>
          </ul>
        </section>

        <section className="rounded-2xl bg-white border shadow-sm p-5 mb-5 space-y-3">
          <h2 className="text-lg font-semibold">Prazo e retenção</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Após a confirmação da solicitação, a exclusão será processada em até 30 dias. Alguns dados podem ser mantidos por prazo adicional quando necessário para cumprimento de obrigação legal, prevenção a fraude, segurança, auditoria ou defesa de direitos.
          </p>
        </section>

        <section className="rounded-2xl bg-emerald-50 border border-emerald-100 p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 font-semibold">
            <ShieldCheck className="w-5 h-5" />
            Privacidade e LGPD
          </div>
          <p className="text-sm text-emerald-900 leading-relaxed">
            Para mais informações sobre coleta, uso, segurança, compartilhamento e seus direitos de titular de dados, acesse nossa Política de Privacidade.
          </p>
          <Link to="/privacy" className="inline-flex text-sm font-semibold text-emerald-700 underline">
            Ver Política de Privacidade
          </Link>
        </section>
      </main>
    </div>
  )
}
