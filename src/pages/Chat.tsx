import { useEffect, useRef, useState } from 'react'
import { Send, Bot, User, Loader2, Sparkles, AlertCircle } from 'lucide-react'
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
      supabase
        .from('health_scores')
        .select('*')
        .eq('user_id', user.id)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const ctx = {
      profile: profileRes.data,
      exams: examsRes.data || [],
      medications: medsRes.data || [],
      score: scoreRes.data,
    }

    setContext(ctx)

    const params = new URLSearchParams(window.location.search)
    const mode = params.get('context')
    const examId = params.get('examId')
const selectedExam = examId
  ? ctx.exams.find((exam: any) => exam.id === examId)
  : null

    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content:
  mode === 'exam' && selectedExam
    ? buildExamOpening(ctx, selectedExam)
    : mode === 'score'
      ? buildScoreOpening(ctx)
      : buildDefaultOpening(ctx),
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
        id: String(Date.now()),
        role: 'user',
        content: question,
        timestamp: new Date(),
      },
    ])

    setInput('')
    setLoading(true)

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
    'Monte um plano de 30 dias',
  ]

  return (
    <div className="space-y-4 pb-40">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Health Coach</h1>
          <p className="text-xs text-muted-foreground">IA contextual com seus dados</p>
        </div>
      </div>

      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-4 border border-purple-100">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-purple-900 mb-1">Contexto ativo</p>
            <p className="text-sm text-purple-800">
              Vou usar seu perfil, exames, medicamentos e HealthScore.
            </p>
          </div>
        </div>
      </div>

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
  const scoreData = ctx?.score || {}
  const score = scoreData.score || p.med_score || 'não calculado'
  const factors = scoreData.factors || {}
  const alerts = factors.alerts || []
  const missing = factors.missingExams || buildMissingExams(p, JSON.stringify(ctx?.exams || []).toLowerCase())
  const breakdown = factors.breakdown || []

  return `Vamos analisar seu HealthScore.

Score atual: ${score}/100.
Nível: ${scoreData.status || 'não informado'}.
Confiança dos dados: ${factors.confidence || 'não calculada'}%.

Principais fatores avaliados:
${breakdown.length ? breakdown.map((b: any) => `- ${b.icon || '•'} ${b.category}: ${b.score}/100`).join('\n') : '- Perfil, hábitos, exames reais e condições cadastradas.'}

Pontos de atenção encontrados:
${alerts.length ? alerts.map((a: string) => `- ${a}`).join('\n') : '- Nenhum alerta importante identificado no momento.'}

Exames/dados pendentes:
${missing.length ? missing.map((m: string) => `- ${m}`).join('\n') : '- Nenhum exame básico pendente identificado.'}

Resumo prático:
${buildScoreAdvice(score, alerts)}

Quer que eu monte um plano de melhoria para os próximos 30 dias?`
}

function generateContextualResponse(question: string, ctx: any) {
  const q = question.toLowerCase()
  const p = ctx?.profile || {}
  const exams = ctx?.exams || []
  const meds = ctx?.medications || []
  const scoreData = ctx?.score || {}
  const score = scoreData.score || p.med_score || 'não calculado'
  const factors = scoreData.factors || {}
  const alerts = factors.alerts || []
  const examsText = JSON.stringify(exams).toLowerCase()
  const examSummaries = buildExamSummaries(exams)

  if (q.includes('plano') || q.includes('30 dias')) {
    return `Plano inicial de 30 dias para melhorar seu HealthScore:

1. Prioridade clínica
${alerts.length ? alerts.map((a: string) => `- Trabalhar: ${a}`).join('\n') : '- Manter prevenção e acompanhar exames regularmente.'}

2. Movimento
- Caminhada ou cardio leve/moderado 30 minutos, 5x por semana.
- Se já treina, manter consistência e incluir exercícios de força.

3. Alimentação
- Reduzir ultraprocessados, frituras, açúcar e excesso de álcool.
- Aumentar fibras: legumes, verduras, aveia, feijão, frutas.
- Priorizar proteínas magras e gorduras boas.

4. Exames/dados faltantes
${formatMissingExams(p, examsText)}

5. Acompanhamento
- Atualize peso, sono, atividade física e medicamentos.
- Suba novos exames quando fizer.
- Recalcule seu HealthScore após mudanças.

Seu score atual é ${score}/100.`
  }

  if (q.includes('score') || q.includes('healthscore') || q.includes('medscore')) {
    return `Seu HealthScore atual é ${score}/100.

O cálculo agora considera:
- Perfil: peso, altura, idade, hábitos e dados básicos
- Estilo de vida: sono, atividade física, tabagismo
- Exames reais analisados por IA/OCR
- Condições cadastradas

Alertas atuais:
${alerts.length ? alerts.map((a: string) => `- ${a}`).join('\n') : '- Nenhum alerta importante identificado.'}

Exames/dados pendentes:
${formatMissingExams(p, examsText)}

Para melhorar:
- Atacar primeiro os pontos alterados nos exames.
- Atualizar perfil e contato de emergência.
- Manter exames preventivos em dia.
- Revisar marcadores alterados com profissional.`
  }

  if (q.includes('exame') || q.includes('colesterol') || q.includes('ldl') || q.includes('glicemia')) {
    return `Você tem ${exams.length} exame(s) cadastrado(s).

Resumo dos exames:
${examSummaries || 'Ainda não há análise IA salva nos exames.'}

Pontos de atenção:
${alerts.length ? alerts.map((a: string) => `- ${a}`).join('\n') : '- Nenhum alerta estruturado identificado.'}

Se o LDL ou colesterol estiverem altos:
- converse com seu médico sobre risco cardiovascular;
- avalie alimentação, atividade física, peso e histórico familiar;
- repita perfil lipídico conforme orientação;
- não inicie medicação sem avaliação profissional.`
  }

  if (q.includes('medicamento') || q.includes('remédio')) {
    return `Medicamentos cadastrados: ${meds.length}.

${meds.length ? meds.map((m: any) => `- ${m.name || m.medication_name || 'Medicamento'} ${m.dosage || ''}`).join('\n') : 'Nenhum medicamento estruturado cadastrado.'}

Também consta no perfil:
${p.current_medications || 'Nenhum medicamento informado no perfil.'}

Mantenha essa lista atualizada para consultas, emergências e compartilhamento profissional.`
  }

  return `Com base no seu contexto atual:

- HealthScore: ${score}/100
- Exames cadastrados: ${exams.length}
- Medicamentos cadastrados: ${meds.length}
- Atividade física: ${translate(p.physical_activity)}
- Tabagismo: ${translate(p.smoking_status)}

Alertas:
${alerts.length ? alerts.map((a: string) => `- ${a}`).join('\n') : '- Nenhum alerta importante identificado.'}

Posso ajudar com:
- entender exames
- melhorar HealthScore
- plano de 30 dias
- lista de exames faltantes
- preparação para consulta médica`
}

function buildExamSummaries(exams: any[]) {
  return exams
    .map((e: any) => {
      const result = e.ai_result || {}
      const items = Array.isArray(result.items) ? result.items : []
      const altered = items.filter((item: any) => item.status && item.status !== 'normal')

      const alteredText = altered.length
        ? altered.map((item: any) => `${item.name}: ${item.value} (${item.status})`).join(', ')
        : ''

      return `${e.file_name || 'Exame'}:
${e.ai_analysis || result.summary || 'Sem resumo.'}
${alteredText ? `Alterações: ${alteredText}` : 'Sem alterações estruturadas relevantes.'}`
    })
    .join('\n\n')
}

function buildScoreAdvice(score: any, alerts: string[]) {
  const n = Number(score)

  if (alerts.length > 0) {
    return `Seu foco deve ser corrigir ou acompanhar os pontos de atenção: ${alerts.join(', ')}.`
  }

  if (!Number.isNaN(n) && n >= 85) {
    return 'Seu score está muito bom. O foco agora é manutenção, prevenção e exames periódicos.'
  }

  if (!Number.isNaN(n) && n >= 70) {
    return 'Seu score está bom, mas ainda pode melhorar com rotina, exames completos e controle de fatores de risco.'
  }

  return 'Seu score indica espaço importante para melhoria. O ideal é atualizar perfil, enviar exames e revisar hábitos.'
}
function buildMissingExams(profile: any, examsText: string) {
  const missing: string[] = []

  if (!examsText.includes('hemograma')) missing.push('Hemograma completo')
  if (!examsText.includes('colesterol') && !examsText.includes('ldl') && !examsText.includes('lipid')) missing.push('Perfil lipídico')
  if (!examsText.includes('glicemia') && !examsText.includes('glucose')) missing.push('Glicemia de jejum')
  if (!profile?.blood_type && !profile?.bloodType) missing.push('Tipagem sanguínea')

  return missing
}

function formatMissingExams(profile: any, examsText: string) {
  const missing = buildMissingExams(profile, examsText)

  if (!missing.length) return '- Nenhum exame básico pendente identificado no momento.'

  return missing.map((m) => `- ${m}`).join('\n')
}

function buildExamOpening(ctx: any, exam: any) {
  const p = ctx?.profile || {}
  const result = exam.ai_result || {}
  const items = Array.isArray(result.items) ? result.items : []

  const itemsText = items.length
    ? items
        .map((item: any) => {
          return `- ${item.name}: ${item.value} | Ref: ${item.reference || 'não informada'} | Status: ${item.status}`
        })
        .join('\n')
    : 'A IA ainda não conseguiu extrair marcadores estruturados deste arquivo.'

  return `Analisei este exame:

Arquivo: ${exam.file_name || 'Exame'}
Status: ${exam.status || 'não informado'}

Resumo da IA:
${exam.ai_analysis || result.summary || 'Resumo não disponível.'}

Marcadores encontrados:
${itemsText}

Contexto do seu perfil:
- Peso: ${p.weight ? `${p.weight} kg` : 'não informado'}
- Altura: ${p.height ? `${p.height} cm` : 'não informado'}
- Tipo sanguíneo: ${p.blood_type || 'não informado'}
- Atividade física: ${translate(p.physical_activity)}
- Tabagismo: ${translate(p.smoking_status)}
- Álcool: ${translate(p.alcohol_consumption)}
- Sono: ${p.sleep_hours ? `${p.sleep_hours}h/noite` : 'não informado'}
- Condições: ${p.chronic_conditions || 'não informado'}
- Medicamentos: ${p.current_medications || 'não informado'}

Pode me perguntar qualquer coisa sobre este exame.`
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
