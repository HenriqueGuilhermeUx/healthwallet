import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, Sparkles, AlertCircle, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
// import { analyzeExamWithAI } from '@/lib/openai'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const HEALTH_TIPS = [
  "Manter 7-8 horas de sono por noite melhora sua saúde cardiovascular",
  "Beber pelo menos 2 litros de água por dia ajuda na digestão e energia",
  "30 minutos de caminhada diária podem reduzir risco de doenças em 40%",
  "Exames de sangue anuais são essenciais para prevenção",
  "Meditação de 10 minutos diários reduz níveis de cortisol",
]

const SUGGESTED_QUESTIONS = [
  "O que significa meu MedScore?",
  "Como melhorar minha saúde cardiovascular?",
  "Quais exames devo fazer este ano?",
  "Como interpretar meus exames de sangue?",
  "Dicas para qualidade do sono",
]

export default function Chat() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showTip, setShowTip] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Mensagem inicial do assistente
    if (messages.length === 0) {
      const userName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || ''
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `Olá${userName ? `, ${userName}` : ''}! Sou seu Assessor de Saúde pessoal. Como posso ajudá-lo hoje?\n\nPosso ajudar com:\n• Análise de exames\n• Interpretação do MedScore\n• Dicas de saúde\n• Informações sobre medicamentos`,
          timestamp: new Date()
        }
      ])
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)
    setShowTip(false)

    try {
      // Simular resposta do assistente (em produção usaria API)
      const response = await generateHealthResponse(input.trim(), user)

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Desculpe, tive um problema ao processar sua mensagem. Tente novamente.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleSuggestedQuestion = (question: string) => {
    setInput(question)
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Assistente de Saúde</h1>
          <p className="text-xs text-muted-foreground">IA personalizada</p>
        </div>
      </div>

      {/* Health Tip Banner */}
      {showTip && messages.length <= 2 && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-4 border border-purple-100">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-purple-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-purple-900 mb-1">Dica de Saúde</p>
              <p className="text-sm text-purple-800">
                {HEALTH_TIPS[Math.floor(Math.random() * HEALTH_TIPS.length)]}
              </p>
            </div>
            <button
              onClick={() => setShowTip(false)}
              className="text-purple-400 hover:text-purple-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="space-y-4 min-h-[50vh]">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            {message.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-emerald-600 text-white rounded-br-md'
                  : 'bg-card border border-border rounded-bl-md'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              <p className={`text-xs mt-1 ${
                message.role === 'user' ? 'text-emerald-200' : 'text-muted-foreground'
              }`}>
                {formatTime(message.timestamp)}
              </p>
            </div>
            {message.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-emerald-600" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                <span className="text-sm text-muted-foreground">Pensando...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions */}
      {messages.length <= 3 && !loading && (
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">Perguntas sugeridas:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((question, index) => (
              <button
                key={index}
                onClick={() => handleSuggestedQuestion(question)}
                className="text-xs bg-purple-50 text-purple-700 px-3 py-2 rounded-full hover:bg-purple-100 transition-colors"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="fixed bottom-20 left-0 right-0 bg-background border-t border-border p-4">
        <div className="max-w-md mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Digite sua pergunta..."
            className="flex-1 bg-card border border-border rounded-full px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-700 transition-colors"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-center text-muted-foreground mt-4">
        <AlertCircle className="w-3 h-3 inline mr-1" />
        Este assistente fornece informações gerais e não substitui orientação médica profissional.
      </p>
    </div>
  )
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Função para gerar respostas de saúde
async function generateHealthResponse(question: string, user: any): Promise<string> {
  const lowerQuestion = question.toLowerCase()

  // Análise de MedScore
  if (lowerQuestion.includes('medscore') || lowerQuestion.includes('score')) {
    return `Seu **MedScore** é calculado com base em 4 categorias principais:

**1. Metabólico (35%)** - Exames de sangue como glicemia, colesterol, PCR
**2. Funcional (25%)** - IMC, pressão arterial, capacidade física
**3. Comportamental (25%)** - Sono, exercícios, passos diários
**4. Mental (15%)** - Níveis de stress e qualidade de vida

Para melhorar seu score:
• Faça exames Laboratoriais completos
• Mantenha peso saudável
• Pratique 150min de exercício por semana
• Durma 7-8 horas por noite
• Faça check-ups anuais`

  }

  // Cardiovascular
  if (lowerQuestion.includes('cardiovascular') || lowerQuestion.includes('coração') || lowerQuestion.includes('coração')) {
    return `Para **saúde cardiovascular**, recomendo:

1. **Exames essenciais:**
   - Perfil lipídico (LDL, HDL, Triglicerídeos)
   - Glicemia de jejum
   - PCR-ultrassensível

2. **Hábitos saudáveis:**
   - 30 min de caminhada diária
   - Reduzir sal e alimentos processados
   - Controlar estresse
   - Dormir bem

3. **Sinais de alerta:**
   - Pressão > 140/90
   - Colesterol total > 200
   - Glicemia > 100 em jejum

Consulte seu cardiologista para avaliação personalizada.`
  }

  // Exames anuais
  if (lowerQuestion.includes('exame') && (lowerQuestion.includes('ano') || lowerQuestion.includes('anual'))) {
    return `**Exames anuais recomendados:**

🔬 **Hemograma completo**
   - Anemia, infecções, problemas de coagulação

🧪 **Perfil lipídico**
   - Colesterol total, LDL, HDL, Triglicerídeos

💉 **Glicemia e HbA1c**
   - Detecção precoce de diabetes

🫁 **PCR-ultrassensível**
   - Risco cardiovascular inflamatório

💊 **Função tireoidiana**
   - TSH, T4 livre

🫀 **Eletrocardiograma**
   - Avaliação elétrica do coração

📅 **Clique em "Upload de Exames" para Registrar seus resultados!**
`
  }

  // Interpretação de exames
  if (lowerQuestion.includes('exame') && (lowerQuestion.includes('interpretar') || lowerQuestion.includes('significa'))) {
    return `Para **interpretar seus exames**, você pode:

1. **Upload de imagem:** Tire foto do exame e envie na seção "Upload de Exames"
2. **IA analisa:** Vou extrair os valores e explicar cada指标
3. **Recomendações:** Forneço orientações baseadas nos resultados

Os principais valores a observar:
- **Glicemia:** <100 normal, 100-125 pré-diabetes, ≥126 diabetes
- **Colesterol LDL:** <100 ideal, 100-129 quase ideal
- **HDL:** ≥60 proteção, <40 baixo
- **Triglicerídeos:** <150 normal

Quer fazer upload de um exame agora?`
  }

  // Sono
  if (lowerQuestion.includes('sono') || lowerQuestion.includes('dormir')) {
    return `Para melhorar a **qualidade do sono:**

🌙 **Rotina noturna:**
   - Desligue telas 1h antes de dormir
   - Mantenha quarto escuro e fresco (18-21°C)
   - Evite café após 14h

⏰ **Horários fixos:**
   - Acorde e durma no mesmo horário
   - Ideal: 22h-23h para dormir

🧘 **Relaxamento:**
   - Meditação de 10min antes de dormir
   -alongamento leve
   - Leitura ou música calma

😴 **Quantidade ideal:**
   - 7-8 horas para adultos
   - Manter consistência no fim de semana

Sono de qualidade melhora MedScore em até 15 pontos!`
  }

  // Medicamentos
  if (lowerQuestion.includes('medicamento') || lowerQuestion.includes('remédio') || lowerQuestion.includes('remédios')) {
    return `Sobre **medicamentos**, sempre consulte seu médico!

📋 **Dicas importantes:**
   - Nunca pare medicação por conta própria
   - Mantenha lista atualizada dos seus remédios
   - Informe ao médico sobre efeitos colaterais
   - Faça acompanhamento regular

💊 Na seção "Medicamentos" do app, você pode:
   - Cadastrar seus remédios atuais
   - Definir horários de lembrete
   - Registrar doses

Quer ajuda para cadastrar seus medicamentos?`
  }

  // Resposta padrão
  return `Entendi sua dúvida! Para ajudá-lo melhor, pode ser mais específico?\n\nPosso ajudar com:\n• Análise do seu MedScore\n• Interpretação de exames\n• Dicas de alimentação e exercícios\n• Informações sobre sono e saúde mental\n• Cadastro de medicamentos\n\nOu faça upload de um exame para análise!`
}
