import { useState, useRef } from 'react'
import { Upload, Camera, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { createMedicalEvent } from '@/services/medicalTimeline'

export default function UploadExam() {
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<{ name: string; id: string } | null>(null)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

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

    try {
      // Upload para Supabase Storage
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}/${Date.now()}.${fileExt}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('exams')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      // Obter URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('exams')
        .getPublicUrl(fileName)

      // Salvar registro no banco
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
      const response = await fetch('https://SEU-SERVICO.onrender.com/analyze-exam', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    recordId: record.id,
    userId: user.id,
    fileUrl: publicUrl,
    fileName: file.name,
    profile: {
      email: user.email,
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
    extractedText:
      analysis?.error ||
      analysis?.extractedText ||
      `Falha na Function analyze-exam. HTTP status: ${response.status}`,
    error:
      analysis?.error ||
      analysis?.extractedText ||
      `Falha na Function analyze-exam. HTTP status: ${response.status}`,
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

setProcessing(false)
setResult(analysis)

    } catch (err: any) {
      setProcessing(false)
      setError(err.message || 'Erro ao enviar arquivo')
    } finally {
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Enviar Exame</h1>
        <p className="text-sm text-muted-foreground">Faça upload de seus exames para análise</p>
      </div>

      {/* Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer ${
          dragOver
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-border hover:border-emerald-500 hover:bg-muted/50'
        }`}
      >
       <input
  ref={fileInputRef}
  type="file"
  accept="image/*,.pdf"
  capture="environment"
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
            <p className="font-semibold mb-1">Arraste ou clique para enviar</p>
            <p className="text-sm text-muted-foreground">
              Formatos: PDF, JPG, PNG (máx. 10MB)
            </p>
          </>
        )}
      </div>

      <button
  onClick={() => fileInputRef.current?.click()}
  className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2"
>
  <Camera className="w-5 h-5" />
  Fotografar exame
</button>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Processing */}
      {processing && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-blue-700">Processando com IA...</p>
            <p className="text-sm text-blue-600">Analisando conteúdo do exame</p>
          </div>
        </div>
      )}

      {/* Result */}
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
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{item.name}</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      item.status === 'normal' ? 'bg-emerald-100 text-emerald-700' :
                      item.status === 'alto' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {item.status === 'normal' ? 'Normal' : item.status === 'alto' ? 'Alto' : 'Atenção'}
                    </span>
                  </div>
                  <p className="text-sm mt-1">
                    Valor: <span className="font-mono font-bold">{item.value}</span>
                    <span className="text-muted-foreground ml-2">Ref: {item.reference}</span>
                  </p>
                </div>
              ))}
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

      {/* Help */}
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
