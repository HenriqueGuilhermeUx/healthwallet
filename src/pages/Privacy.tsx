import { Heart, ChevronLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Privacy() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Link to="/profile" className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors">
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

      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Política de Privacidade</h1>

        <div className="prose prose-sm max-w-none text-muted-foreground space-y-4">
          <p className="text-sm">Data de vigência: 01 de Janeiro de 2024</p>

          <h2 className="text-lg font-semibold text-foreground">1. Introdução</h2>
          <p className="text-sm">
            A HealthWallet (@MyDataMed) está comprometida em proteger sua privacidade.
            Esta Política de Privacidade explica como coletamos, usamos, armazenamos
            e protegemos seus dados pessoais, em conformidade com a LGPD (Lei Geral de Proteção de Dados).
          </p>

          <h2 className="text-lg font-semibold text-foreground">2. Dados que Coletamos</h2>
          <p className="text-sm">Nós coletamos os seguintes tipos de dados:</p>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li><strong>Dados de cadastro:</strong> nome, e-mail, data de nascimento</li>
            <li><strong>Dados de saúde:</strong> tipo sanguíneo, peso, altura, histórico médico</li>
            <li><strong>Exames e documentos:</strong> arquivos de exames, prescrições, laudos</li>
            <li><strong>Dados de uso:</strong> histórico de navegação, interações com o app</li>
            <li><strong>Dados de dispositivo:</strong> tipo de celular, sistema operacional</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground">3. Como Usamos seus Dados</h2>
          <p className="text-sm">Seus dados são usados para:</p>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>Fornecer e manter nossos serviços</li>
            <li>Realizar análises de saúde com inteligência artificial</li>
            <li>Permitir compartilhamento seguro com profissionais de saúde</li>
            <li>Melhorar nossos serviços e experiência do usuário</li>
            <li>Enviar notificações sobre sua conta e resultados de exames</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground">4. Armazenamento e Segurança</h2>
          <p className="text-sm">
            Utilizamos infraestrutura de nuvem com criptografia de dados em repouso e em trânsito.
            Seus dados são armazenados em servidores seguros no Brasil, em conformidade
            com a LGPD. Apenas pessoal autorizado tem acesso aos dados.
          </p>

          <h2 className="text-lg font-semibold text-foreground">5. Seus Direitos (LGPD)</h2>
          <p className="text-sm">De acordo com a LGPD, você tem direito a:</p>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li><strong>Confirmação:</strong> saber se tratamos seus dados</li>
            <li><strong>Acesso:</strong> acessar seus dados pessoais</li>
            <li><strong>Correção:</strong> corrigir dados incompletos ou desatualizados</li>
            <li><strong>Anonimização:</strong> solicitar anonimização de seus dados</li>
            <li><strong>Exclusão:</strong> solicitar a exclusão de seus dados</li>
            <li><strong>Portabilidade:</strong> receber seus dados em formato legível</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground">6. Compartilhamento de Dados</h2>
          <p className="text-sm">
            Não vendemos seus dados. Compartilhamos informações apenas nas seguintes situações:
          </p>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>Com sua autorização explícita</li>
            <li>Com profissionais de saúde que você escolher</li>
            <li>Para cumprir obrigações legais</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground">7. Retenção de Dados</h2>
          <p className="text-sm">
            Mantemos seus dados pelo tempo necessário para fornecer nossos serviços.
            Você pode solicitar a exclusão de sua conta a qualquer momento,
            e seus dados serão removidos em até 30 dias, exceto quando exigido por lei.
          </p>

          <h2 className="text-lg font-semibold text-foreground">8. Alterações</h2>
          <p className="text-sm">
            Esta política pode ser atualizada periodicamente. Notificar вас sobre
            alterações significativas através do aplicativo ou e-mail.
          </p>

          <h2 className="text-lg font-semibold text-foreground">9. Contato</h2>
          <p className="text-sm">
            Para questões sobre privacidade ou exercer seus direitos:
          </p>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>E-mail: <span className="text-emerald-600">privacidade@healthwallet.com.br</span></li>
            <li>Encarregado de Dados (DPO): equipe HealthWallet</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
