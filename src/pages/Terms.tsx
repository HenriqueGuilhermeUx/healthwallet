import { Heart, ChevronLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Terms() {
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
        <h1 className="text-2xl font-bold mb-6">Termos de Uso</h1>

        <div className="prose prose-sm max-w-none text-muted-foreground space-y-4">
          <p className="text-sm">Data de vigência: 01 de Janeiro de 2024</p>

          <h2 className="text-lg font-semibold text-foreground">1. Aceitação dos Termos</h2>
          <p className="text-sm">
            Ao acessar e utilizar o HealthWallet, você concorda com estes Termos de Uso.
            Se você não concorda com algum dos termos, não utilize nossa plataforma.
          </p>

          <h2 className="text-lg font-semibold text-foreground">2. Descrição do Serviço</h2>
          <p className="text-sm">
            O HealthWallet é uma plataforma digital que permite aos usuários armazenar,
            gerenciar e compartilhar suas informações de saúde de forma segura, incluindo:
          </p>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>Exames médicos e resultados de laboratório</li>
            <li>Histórico de saúde e informações pessoais</li>
            <li>Carteirinhas de plano de saúde</li>
            <li>Documentos e prescrições médicas</li>
            <li>Análises de saúde assistidas por inteligência artificial</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground">3. Cadastro e Conta</h2>
          <p className="text-sm">
            Para utilizar o HealthWallet, você deve criar uma conta com informações verdadeiras.
            Você é responsável por manter a confidencialidade de sua conta e senha.
          </p>

          <h2 className="text-lg font-semibold text-foreground">4. Dados de Saúde</h2>
          <p className="text-sm">
            O HealthWallet trata seus dados de saúde como informações sensíveis.
            Implementamos medidas de segurança apropriadass para proteger suas informações,
            mas você também deve tomar precauções, como manter sua senha segura.
          </p>

          <h2 className="text-lg font-semibold text-foreground">5. Compartilhamento de Dados</h2>
          <p className="text-sm">
            Você pode escolher compartilhar seus dados de saúde com profissionais de saúde.
            O HealthWallet não compartilhará seus dados sem seu consentimento explícito.
          </p>

          <h2 className="text-lg font-semibold text-foreground">6. Limitação de Responsabilidade</h2>
          <p className="text-sm">
            O HealthWallet oferece análises e sugestões baseadas em inteligência artificial,
            mas estas não substituem o diagnóstico médico profissional.
            Sempre consulte um médico para decisões médicas.
          </p>

          <h2 className="text-lg font-semibold text-foreground">7. Modificações dos Termos</h2>
          <p className="text-sm">
            Reservamo-nos o direito de modificar estes termos a qualquer momento.
            Alterações significativas serão comunicadas por e-mail ou notificação no aplicativo.
          </p>

          <h2 className="text-lg font-semibold text-foreground">8. Contato</h2>
          <p className="text-sm">
            Para questões sobre estes termos, entre em contato pelo e-mail:
            <span className="text-emerald-600"> contato@healthwallet.com.br</span>
          </p>
        </div>
      </div>
    </div>
  )
}
