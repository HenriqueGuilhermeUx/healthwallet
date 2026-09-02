import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Upload, Plus, ChevronRight, FileText, Clock, CheckCircle, AlertCircle, Eye, Mail } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

interface Exam {
  id: string
  file_name: string
  file_url?: string
  exam_type?: string
  exam_date?: string
  laboratory?: string
  ai_analysis?: string
  status: string
  created_at: string
}

export default function Exams() {
  const { user } = useAuth()
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadExams()
  }, [user])

  const loadExams = async () => {
    if (!user) return

    setLoading(true)

    try {
      const { data, error } = await supabase
        .from('medical_records')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      setExams(data || [])
    } catch (error) {
      console.error('Error loading exams:', error)
      setExams([])
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('pt-BR')
  }

  const isAnalyzed = (status?: string) => {
    return status === 'processed' || status === 'analyzed'
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Meus Exames</h1>
        <p className="text-sm text-muted-foreground">
          Exames enviados para o seu cofre de saúde
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <Link
          to="/upload"
          className="flex items-center gap-3 rounded-2xl bg-violet-600 p-4 text-white shadow-sm"
        >
          <Upload className="h-6 w-6" />
          <div>
            <p className="font-semibold">Enviar Exame</p>
            <p className="text-xs opacity-80">PDF, foto ou imagem</p>
          </div>
        </Link>

        <Link
          to="/exam-inbox"
          className="flex items-center gap-3 rounded-2xl bg-emerald-600 p-4 text-white shadow-sm"
        >
          <Mail className="h-6 w-6" />
          <div>
            <p className="font-semibold">Receber por e-mail</p>
            <p className="text-xs opacity-80">Encaminhe DASA, Fleury, laudos e anexos para sua carteira</p>
          </div>
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Carregando...
        </div>
      ) : exams.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-dashed border-border">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Nenhum exame</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Envie seus primeiros exames por upload, foto ou e-mail
          </p>
          <div className="flex flex-col gap-2 items-center">
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Enviar exame
            </Link>
            <Link
              to="/exam-inbox"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium"
            >
              <Mail className="w-4 h-4" /> Receber por e-mail
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <Link
              key={exam.id}
              to={`/chat?context=exam&examId=${exam.id}`}
              className="block bg-card rounded-xl border border-border p-4"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isAnalyzed(exam.status) ? 'bg-emerald-100' : 'bg-yellow-100'
                  }`}
                >
                  <FileText
                    className={`w-5 h-5 ${
                      isAnalyzed(exam.status)
                        ? 'text-emerald-600'
                        : 'text-yellow-600'
                    }`}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {exam.file_name || 'Exame enviado'}
                  </p>

                  <p className="text-xs text-muted-foreground mt-0.5">
                    {exam.exam_type && `${exam.exam_type} • `}
                    {formatDate(exam.exam_date || exam.created_at)}
                  </p>

                  {exam.ai_analysis && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                      {exam.ai_analysis}
                    </p>
                  )}

                  {exam.file_url && (
                    <span className="inline-flex items-center gap-1 mt-3 text-xs text-emerald-700 font-medium">
                      <Eye className="w-3 h-3" />
                      Abrir análise e conversar
                    </span>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      isAnalyzed(exam.status)
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {isAnalyzed(exam.status) ? (
                      <>
                        <CheckCircle className="w-3 h-3" /> Analisado
                      </>
                    ) : (
                      <>
                        <Clock className="w-3 h-3" /> Enviado
                      </>
                    )}
                  </span>

                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
        <p className="text-xs text-blue-800">
          Você pode enviar manualmente, fotografar ou encaminhar documentos por e-mail. Tudo recebido por e-mail fica pendente até sua aprovação.
        </p>
      </div>
    </div>
  )
}
