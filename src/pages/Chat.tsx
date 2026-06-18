import { useEffect, useRef, useState } from 'react'
import { Send, Bot, User, Loader2, Sparkles, AlertCircle, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function Chat() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showTip, setShowTip] = useState(true)
  const [context, setContext] = useState<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadContext()
  }, [user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadContext() {
    if (!user) return

    const [profileRes, examsRes, medsRes, scoreRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase
  .from('medical_records')
  .select('id, file_name, exam_type, status, ai_analysis, ai_result, extracted_text, created_at')
  .eq('user_id', user.id)
  .order('created_at', { ascending: false })
  .limit(10),
      supabase.from('medications').select('*').eq('user_id', user.id),
      supabase.from('health_scores').select('*').eq('user_id', user.id).order('calculated_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    const ctx = {
      profile: profileRes.data,
      exams: examsRes.data || [],
      medications: medsRes.data || [],
      score: scoreRes.data,
    }

    setContext(ctx)

    const searchParams = new URLSearchParams(window.location.search)
    const mode = searchParams.get('context')

    const welcome =
      mode === 'score'
        ? buildScoreOpening(ctx)
        : buildDefaultOpening(ctx)

    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: welcome,
        timestamp: new Date(),
      },
    ])
  }

  async function handleSend() {
    if (!input.trim() || loading) return

    const question = input.trim()

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'user',
        content: question,
        timestamp: new Date(),
      },
    ])

    setInput('')
    setLoading(true)
    setShowTip(false)

    const response = generateContextualResponse(question, context)

    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      },
    ])

    setLoading(false)
  }

  const suggestedQuestions = [
    'Como melhorar meu HealthScore?',
    'O que meus exames mostram?',
    'Quais exames estão faltando?',
    'Como melhorar colesterol e metabolismo?',
    'Monte um plano de 30 dias',
  ]

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Health Coach</h1>
          <p className="text-xs text-muted-foreground">IA contextual com seus dados</p>
        </div>
      </div>

      {showTip && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-4 border border-purple-100">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-purple-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-purple-900 mb-1">Contexto ativo</p>
              <p className="text-sm text-purple-800">
                Vou responder usando seu perfil, HealthScore, exames enviados e medicamentos cadastrados.
              </p>
            </div>
            <button onClick={() => setShowTip(false)} className="text-purple-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4 min-h-[50vh]">
        {messages.map((message) => (
          <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
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
              <p className={`text-xs mt-1 ${message.role === 'user' ? 'text-emerald-200' : 'text-muted-foreground'}`}>
                {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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

      {messages.length <= 2 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">Perguntas sugeridas:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((question) => (
              <button
                key={question}
                onClick={() => setInput(question)}
                className="text-xs bg-purple-50 text-purple-700 px-3 py-2 rounded-full hover:bg-purple-100"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="fixed bottom-20 left-0 right-0 bg-background border-t border-border p-4">
        <div className="max-w-md mx-auto flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Pergunte sobre seu score, exames ou saúde..."
            className="flex-1 bg-card border border-border rounded-full px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <p className="text-xs text-center text-muted-foreground mt-4">
        <AlertCircle className="w-3 h-3 inline mr-1" />
        Informativo. Não substitui orientação médica profissional.
      </p>
    </div>
  )
}

function buildDefaultOpening(ctx: any) {
  const score = ctx?.score?.score || ctx?.profile?.med_score || 'não calculado'
  const exams = ctx?.exams?.length || 0

  return `Olá! Sou seu Health Coach.

Seu HealthScore atual: ${score}/100.
Exames cadastrados: ${exams}.

Posso te ajudar a entender seus exames, melhorar seu score, revisar hábitos e montar um plano de ação.`
}

function buildScoreOpening(ctx: any) {
  const p = ctx?.profile || {}
  const score = ctx?.score?.score || p.med_score || 'não calculado'
  const exams = ctx?.exams || []
  const examsText = JSON.stringify(exams).toLowerCase()
  const examSummaries = exams
  .map((e: any) => {
    const result = e.ai_result
    const items = result?.items || []
    const itemText = Array.isArray(items)
      ? items.map((item: any) => `${item.name}: ${item.value} (${item.status})`).join(', ')
      : ''

    return `${e.file_name || 'Exame'}: ${e.ai_analysis || result?.summary || itemText || 'sem análise estruturada'}`
  })
  .join('\n')

  const missing = []
  if (!examsText.includes('hemograma')) missing.push('Hemograma completo')
  if (!examsText.includes('colesterol') && !examsText.includes('ldl') && !examsText.includes('lipid')) missing.push('Perfil lipídico')
  if (!examsText.includes('glicemia') && !examsText.includes('glucose')) missing.push('Glicemia de jejum')
  if (!p.blood_type) missing.push('Tipagem sanguínea')

  return `Vamos analisar seu HealthScore.

Score atual: ${score}/100.

Dados que encontrei:
• Peso: ${p.weight ? `${p.weight} kg` : 'não informado'}
• Altura: ${p.height ? `${p.height} cm` : 'não informado'}
• Atividade física: ${translate(p.physical_activity)}
• Tabagismo: ${translate(p.smoking_status)}
• Sono: ${p.sleep_hours ? `${p.sleep_hours}h/noite` : 'não informado'}
• Exames enviados: ${exams.length}

${missing.length ? `Exames/dados que ainda podem melhorar sua análise:\n${missing.map((m) => `• ${m}`).join('\n')}` : 'Você já tem os principais dados básicos cadastrados.'}

Quer que eu monte um plano de melhoria para os próximos 30 dias?`
}

function generateContextualResponse(question: string, ctx: any) {
  const q = question.toLowerCase()
  const p = ctx?.profile || {}
  const exams = ctx?.exams || []
  const meds = ctx?.medications || []
  const score = ctx?.score?.score || p.med_score || 'não calculado'
  const examsText = JSON.stringify(exams).toLowerCase()

  if (q.includes('plano') || q.includes('30 dias')) {
    return `Plano inicial de 30 dias:

1. Movimento
• Caminhada 30 minutos, 5x por semana.
• Se já treina, manter consistência e registrar evolução.

2. Alimentação
• Reduzir ultraprocessados, açúcar e frituras.
• Priorizar proteína magra, legumes, frutas, fibras e água.

3. Exames
${buildMissingExamList(p, examsText)}

4. Acompanhamento
• Atualize peso, sono e atividade física no Perfil.
• Suba novos exames em Exames.
• Recalcule seu HealthScore após atualizar os dados.

Seu score atual é ${score}/100.`
  }

  if (q.includes('score') || q.includes('healthscore') || q.includes('medscore')) {
    return `Seu HealthScore atual é ${score}/100.

Ele considera perfil, hábitos, exames, medicamentos e dados preventivos.

Pontos que encontrei:
• Peso: ${p.weight || 'não informado'}
• Altura: ${p.height || 'não informado'}
• Atividade física: ${translate(p.physical_activity)}
• Sono: ${p.sleep_hours || 'não informado'}
• Tabagismo: ${translate(p.smoking_status)}
• Exames enviados: ${exams.length}

Para melhorar:
${buildMissingExamList(p, examsText)}
• Manter rotina de exercício.
• Atualizar medicamentos e condições no Perfil.
• Revisar alterações dos exames com profissional.`
  }

  if (q.includes('exame') || q.includes('colesterol') || q.includes('glicemia')) {
    const altered = exams.filter((e: any) => {
      const text = JSON.stringify(e).toLowerCase()
      return text.includes('alto') || text.includes('baixo') || text.includes('atenção') || text.includes('alterado') || text.includes('colesterol')
    })

    return `Você tem ${exams.length} exame(s) cadastrado(s).

Resumo do que encontrei:
${examSummaries || 'Ainda não há análise IA salva nos exames.'}

Sugestão:
• Abra Exames e revise os arquivos enviados.
• Se colesterol apareceu alto, converse com médico sobre perfil lipídico completo: LDL, HDL e triglicerídeos.
• Combine isso com atividade física, sono e alimentação.

Posso montar um plano específico para colesterol, se quiser.`

${altered.length ? `Encontrei possíveis pontos de atenção em ${altered.length} registro(s), especialmente quando aparece colesterol, valores altos/baixos ou análise da IA.` : 'Ainda não encontrei alterações estruturadas nos exames.'}

Sugestão:
• Abra Exames e revise os arquivos enviados.
• Se colesterol apareceu alto, converse com médico sobre perfil lipídico completo: LDL, HDL e triglicerídeos.
• Combine isso com atividade física, sono e alimentação.

Posso montar um plano específico para colesterol, se quiser.`
  }

  if (q.includes('medicamento') || q.includes('remédio')) {
    return `Medicamentos cadastrados: ${meds.length}.

${meds.length ? meds.map((m: any) => `• ${m.name || m.medication_name || 'Medicamento'} ${m.dosage || ''}`).join('\n') : 'Nenhum medicamento estruturado cadastrado.'}

Mantenha essa lista atualizada. Isso ajuda muito em consulta, emergência e compartilhamento com profissional.`
  }

  return `Com base no seu perfil atual:

• HealthScore: ${score}/100
• Exames cadastrados: ${exams.length}
• Medicamentos cadastrados: ${meds.length}
• Atividade física: ${translate(p.physical_activity)}
• Tabagismo: ${translate(p.smoking_status)}

Posso ajudar com:
• melhorar score
• entender exames
• plano de 30 dias
• lista de exames faltantes
• preparação para consulta médica`
}

function buildMissingExamList(profile: any, examsText: string) {
  const missing = []

  if (!examsText.includes('hemograma')) missing.push('Hemograma completo')
  if (!examsText.includes('colesterol') && !examsText.includes('ldl') && !examsText.includes('lipid')) missing.push('Perfil lipídico')
  if (!examsText.includes('glicemia') && !examsText.includes('glucose')) missing.push('Glicemia de jejum')
  if (!profile?.blood_type) missing.push('Tipagem sanguínea')

  if (!missing.length) return '• Nenhum exame básico pendente identificado no momento.'

  return missing.map((m) => `• ${m}`).join('\n')
}

function translate(value: any) {
  const map: Record<string, string> = {
    moderate: 'moderada',
    active: 'ativa',
    light: 'leve',
    sedentary: 'sedentária',
    never: 'nunca',
    former: 'ex-fumante',
    current: 'fumante atual',
    occasional: 'ocasional',
    frequent: 'frequente',
  }

  return value ? map[value] || value : 'não informado'
}
