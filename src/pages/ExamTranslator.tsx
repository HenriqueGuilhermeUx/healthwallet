import { useState } from 'react'
import { Brain, Loader2, Copy, CheckCircle, AlertCircle } from 'lucide-react'
import { analyzeExamWithAI, getMockExamAnalysis } from '@/lib/openai'

const EXAM_TYPES = [
  { value: 'hemograma', label: 'Hemograma Completo' },
  { value: 'lipidico', label: 'Perfil Lipídico' },
  { value: 'tireoide', label: 'Função Tireoidiana' },
  { value: 'glicemia', label: 'Glicemia e Diabetes' },
  { value: 'renal', label: 'Função Renal' },
  { value: 'hepatico', label: 'Função Hepática' },
  { value: 'outro', label: 'Outro' },
]

interface ExamItem {
  name: string
  value: string
  reference: string
  status: 'normal' | 'alto' | 'baixo' | 'atencao'
  explanation: string
}

interface TranslationResult {
  summary: string
  items: ExamItem[]
  nextSteps: string[]
}

export default function ExamTranslator() {
  const [examText, setExamText] = useState('')
  const [selectedType, setSelectedType] = useState('hemograma')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TranslationResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const handleTranslate = async () => {
    if (!examText.trim()) return

    setLoading(true)
    setError('')
    setResult(null)

    try {
      // Try to use OpenAI API
      const aiResult = await analyzeExamWithAI(examText, selectedType)
      setResult(aiResult)
    } catch (err) {
      console.error('AI Analysis failed:', err)
      // Fallback to mock data
      setResult(getMockExamAnalysis(selectedType))
      setError('Usando análise simulada. Configure VITE_OPENAI_API_KEY para análise com IA real.')
    }

    setLoading(false)
  }

  const copyToClipboard = () => {
    if (!result) return
    const text = `Tradução de Exame\n\n${result.summary}\n\n${result.items.map(item => `${item.name}: ${item.value} (Ref: ${item.reference})`).join('\n')}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'normal': return 'bg-emerald-50 border-emerald-200 text-emerald-700'
      case 'alto': return 'bg-red-50 border-red-200 text-red-700'
      case 'baixo': return 'bg-blue-50 border-blue-200 text-blue-700'
      default: return 'bg-yellow-50 border-yellow-200 text-yellow-700'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'normal': return <CheckCircle className="w-4 h-4" />
      case 'alto': return <AlertCircle className="w-4 h-4" />
      case 'baixo': return <AlertCircle className="w-4 h-4" />
      default: return <AlertCircle className="w-4 h-4" />
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Tradutor de Exames</h1>
        <p className="text-sm text-muted-foreground">Cole o texto do laudo para análise</p>
      </div>

      {/* Error notice */}
      {error && (
        <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Tipo de Exame</label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background"
          >
            {EXAM_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Texto do Laudo</label>
          <textarea
            value={examText}
            onChange={(e) => setExamText(e.target.value)}
            placeholder="Cole aqui o texto do seu exame, por exemplo:

Hemoglobina: 14,2 g/dL (Ref: 12,0 - 16,0)
Leucócitos: 6.500 /mm³ (Ref: 4.000 - 11.000)
Colesterol Total: 224 mg/dL (Ref: < 190)"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background min-h-[200px] resize-y"
          />
        </div>

        <button
          onClick={handleTranslate}
          disabled={loading || !examText.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Analisando com IA...</>
          ) : (
            <><Brain className="w-5 h-5" /> Traduzir Exame</>
          )}
        </button>
      </div>

      {result && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle className="w-5 h-5" />
              <p className="font-semibold">Análise Completa</p>
            </div>
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>

          <p className="text-sm">{result.summary}</p>

          <div className="space-y-3">
            {result.items.map((item, idx) => (
              <div key={idx} className={`p-3 rounded-lg border ${getStatusStyle(item.status)}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-sm">{item.name}</p>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/50 flex items-center gap-1">
                    {getStatusIcon(item.status)}
                    {item.status === 'normal' ? 'Normal' : item.status === 'alto' ? 'Alto' : item.status === 'baixo' ? 'Baixo' : 'Atenção'}
                  </span>
                </div>
                <p className="text-sm mb-1">
                  Valor: <span className="font-mono font-bold">{item.value}</span>
                  <span className="text-muted-foreground ml-2">Ref: {item.reference}</span>
                </p>
                <p className="text-xs opacity-80">{item.explanation}</p>
              </div>
            ))}
          </div>

          {result.nextSteps && result.nextSteps.length > 0 && (
            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-2">Próximos passos:</p>
              <ul className="space-y-1">
                {result.nextSteps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-emerald-600">•</span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600">
        <strong>Aviso:</strong> Esta análise é apenas informativa e não substitui a avaliação médica profissional. Sempre consulte seu médico para interpretar seus exames.
      </div>
    </div>
  )
}