import { useState, useRef } from 'react'
import { Upload, Camera, Loader2, CheckCircle, AlertCircle, Send } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { createMedicalEvent } from '@/services/medicalTimeline'

type ExamChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

const OCR_API_URL = 'https://healthwallet-ocr-api.onrender.com'

export default function UploadExam() {
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<{ name: string; id: string } | null>(null)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const [examQuestion, setExamQuestion] = useState('')
  const [examChat, setExamChat] = useState<ExamChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState(false)

  const openPicker = () => {
    if (uploading || processing) return
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (file: File) => {
    if (!user) return

    const isImage = file.type.startsWith('image/')
    const isPDF = file.type === 'application/pdf'

    if (!isImage && !isPDF) {
      setError('Apenas arquivos PDF ou imagem são aceitos')
      return
    }

    setUploading(true)
    setError(null)
    setResult(null)
    setExamQuestion('')
    setExamChat([])

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}/${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('exams')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('exams')
        .getPublicUrl(fileName)

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      const { data: record, error: dbError } = await supabase
        .from('medical_records')
        .insert({
          user_id: user.id,
          file_url: publicUrl,
          file_name: file.name,
          exam_type: 'Exame',
          status: 'pending',
        })
        .select()
        .single()

      if (dbError) throw dbError

      await createMedicalEvent({
        userId: user.id,
        type: 'exam',
        title: 'Exame enviado',
        description: `${file.name} enviado para análise`,
      })

      setUploadedFile({ name: file.name, id: record.id })
      setProcessing(true)

      const response = await fetch(`${OCR_API_URL}/analyze-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId: record.id,
          userId: user.id,
          fileUrl: publicUrl,
          fileName: file.name,
          profile: {
            email: user.email,
            ...profile,
          },
        }),
      })

      let analysis: any = null

      try {
        analysis = await response.json()
      } catch {
        analysis = null
      }

      if (!response.ok || !analysis) {
        analysis = {
          summary:
            'Exame recebido com sucesso. A análise automática ainda não conseguiu interpretar este arquivo, mas ele foi salvo no seu cofre de saúde.',
          items: [],
          nextSteps: [
            'Tente enviar uma foto mais nítida ou PDF com texto selecionável.',
            'Leve o exame para avaliação de um profissional de saúde.',
          ],
          mainAlerts: [],
          goodNews: [],
          extractedText:
            analysis?.error ||
            analysis?.extractedText ||
            `Falha na API OCR. HTTP status: ${response.status}`,
          error:
            analysis?.error ||
            analysis?.extractedText ||
            `Falha na API OCR. HTTP status: ${response.status}`,
        }
      }

      await supabase
        .from('medical_records')
        .update({
          status: 'processed',
          exam_type: analysis.examType || 'Exame',
          exam_date: analysis.examDate || null,
          laboratory: analysis.laboratory || null,
          ai_analysis: analysis.summary || '',
          ai_result: analysis,
          extracted_text: analysis.extractedText || null,
          analyzed_at: new Date().toISOString(),
        })
        .eq('id', record.id)

      setResult(analysis)

      setExamChat([
        {
          role: 'assistant',
          content:
            'Pronto. Analisei seu exame. Agora você pode me perguntar sobre qualquer marcador, risco, próximos passos ou cuidados específicos.',
        },
      ])
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar arquivo')
    } finally {
      setProcessing(false)
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  async function askAboutExam() {
    if (!examQuestion.trim() || !result || chatLoading) return

    const question = examQuestion.trim()

    const userMessage: ExamChatMessage = {
      role: 'user',
      content: question,
    }

    const newHistory = [...examChat, userMessage]

    setExamChat(newHistory)
    setExamQuestion('')
    setChatLoading(true)

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .maybeSingle()

      const response = await fetch(`${OCR_API_URL}/ask-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          exam: result,
          profile: {
            email: user?.email,
            ...profile,
          },
          history: newHistory,
        }),
      })

      const data = await response.json()

      setExamChat((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer || 'Não consegui responder agora.',
        },
      ])
    } catch (err: any) {
      setExamChat((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'Não consegui conectar com a IA agora. Tente novamente em alguns instantes.',
        },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Enviar Exame</h1>
        <p className="text-sm text-muted-foreground">
          Faça upload de seus exames para análise
        </p>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onClick={openPicker}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer ${
          dragOver
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-border hover:border-emerald-500 hover:bg-muted/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          className="hidden"
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-12 h-12 animate-spin text-emerald-600" />
            <p className="text-sm text-muted-foreground">Enviando arquivo...</p>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8 text-emerald-600" />
            </div>
            <p className="font-semibold mb-1">Toque para escolher arquivo</p>
            <p className="text-sm text-muted-foreground">
              PDF, JPG ou PNG. Você também pode tirar foto pela câmera.
            </p>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={openPicker}
        disabled={uploading || processing}
        className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <Camera className="w-5 h-5" />
        Enviar foto ou arquivo
      </button>

      {uploadedFile && !error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">Arquivo salvo: {uploadedFile.name}</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {processing && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-blue-700">Processando com IA...</p>
            <p className="text-sm text-blue-600">Analisando conteúdo do exame</p>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-4">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle className="w-5 h-5" />
            <p className="font-semibold">Exame processado!</p>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Resultado da análise:</p>

            <div className="space-y-2">
              {(result.items || []).map((item: any, idx: number) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${
                    item.status === 'normal'
                      ? 'bg-emerald-50 border-emerald-200'
                      : item.status === 'alto'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">{item.name}</p>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        item.status === 'normal'
                          ? 'bg-emerald-100 text-emerald-700'
                          : item.status === 'alto'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {item.status === 'normal'
                        ? 'Normal'
                        : item.status === 'alto'
                        ? 'Alto'
                        : 'Atenção'}
                    </span>
                  </div>

                  <p className="text-sm mt-1">
                    Valor:{' '}
                    <span className="font-mono font-bold">{item.value}</span>
                    <span className="text-muted-foreground ml-2">
                      Ref: {item.reference || item.referenceRange || '—'}
                    </span>
                  </p>

                  {item.explanation && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {item.explanation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {result.goodNews?.length > 0 && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="font-semibold text-emerald-900 mb-2">
                Pontos positivos
              </p>
              <ul className="text-sm text-emerald-800 space-y-1">
                {result.goodNews.map((item: string, idx: number) => (
                  <li key={idx}>• {item}</li>
                ))}
              </ul>
            </div>
          )}

          {result.mainAlerts?.length > 0 && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200">
              <p className="font-semibold text-red-900 mb-2">
                Pontos de atenção
              </p>
              <ul className="text-sm text-red-800 space-y-1">
                {result.mainAlerts.map((item: string, idx: number) => (
                  <li key={idx}>• {item}</li>
                ))}
              </ul>
            </div>
          )}

          {result.summary && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
              <p className="font-semibold text-blue-900 mb-2">Comentário da IA</p>
              <p className="text-sm text-blue-800">{result.summary}</p>
            </div>
          )}

          {result.nextSteps?.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <p className="font-semibold text-amber-900 mb-2">Próximos passos</p>
              <ul className="text-sm text-amber-800 space-y-1">
                {result.nextSteps.map((step: string, idx: number) => (
                  <li key={idx}>• {step}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 space-y-3">
            <p className="font-semibold text-purple-900">
              Converse sobre este exame
            </p>

            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {examChat.map((message, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl text-sm whitespace-pre-wrap ${
                    message.role === 'user'
                      ? 'bg-purple-600 text-white ml-8'
                      : 'bg-white border border-purple-100 text-gray-900 mr-8'
                  }`}
                >
                  {message.content}
                </div>
              ))}

              {chatLoading && (
                <div className="bg-white border border-purple-100 text-gray-900 mr-8 p-3 rounded-xl text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                  Pensando...
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <textarea
                value={examQuestion}
                onChange={(e) => setExamQuestion(e.target.value)}
                placeholder="Ex: Como posso cuidar do colesterol?"
                className="flex-1 min-h-[70px] rounded-xl border border-purple-200 p-3 text-sm"
              />

              <button
                type="button"
                onClick={askAboutExam}
                disabled={!examQuestion.trim() || chatLoading}
                className="w-12 rounded-xl bg-purple-600 text-white flex items-center justify-center disabled:opacity-50"
              >
                {chatLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          <a
            href="/exams"
            className="block w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold text-center hover:bg-emerald-700 transition-colors"
          >
            Ver meus exames
          </a>
        </div>
      )}

      <div className="bg-muted/50 rounded-xl p-4">
        <p className="text-sm font-medium mb-2">Dicas:</p>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Fotos de exames devem estar legíveis</li>
          <li>• PDF é o formato ideal para laudos</li>
          <li>• A IA analisa automaticamente valores de exames</li>
        </ul>
      </div>
    </div>
  )
}
