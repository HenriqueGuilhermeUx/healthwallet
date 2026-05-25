import { useState, useEffect } from 'react'
import { Activity, Upload, Brain, Plus, ChevronRight, FileText, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

interface Exam {
  id: string
  file_name: string
  exam_type: string
  exam_date?: string
  laboratory?: string
  ai_analysis?: string
  status: 'pending' | 'processed'
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
    try {
      const { data } = await supabase
        .from('medical_records')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      setExams(data || [])
    } catch (error) {
      console.error('Error loading exams:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Meus Exames</h1>
        <p className="text-sm text-muted-foreground">Todos os seus exames em um só lugar</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <a
          href="/upload"
          className="flex items-center gap-3 p-4 rounded-xl bg-violet-600 text-white"
        >
          <Upload className="w-6 h-6" />
          <div>
            <p className="font-semibold">Enviar Exame</p>
            <p className="text-xs opacity-80">Upload de arquivo</p>
          </div>
        </a>
        <a
          href="/translator"
          className="flex items-center gap-3 p-4 rounded-xl bg-purple-600 text-white"
        >
          <Brain className="w-6 h-6" />
          <div>
            <p className="font-semibold">Traduzir</p>
            <p className="text-xs opacity-80">Colar laudo</p>
          </div>
        </a>
      </div>

      {/* Exams List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : exams.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-dashed border-border">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Nenhum exame</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Envie seus primeiros exames para análise
          </p>
          <a
            href="/upload"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Enviar exame
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <a
              key={exam.id}
              href={`/upload?id=${exam.id}`}
              className="block bg-card rounded-xl border border-border p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  exam.status === 'processed' ? 'bg-emerald-100' : 'bg-yellow-100'
                }`}>
                  <FileText className={`w-5 h-5 ${
                    exam.status === 'processed' ? 'text-emerald-600' : 'text-yellow-600'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{exam.file_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {exam.exam_type && `${exam.exam_type} • `}
                    {exam.exam_date ? formatDate(exam.exam_date) : formatDate(exam.created_at)}
                  </p>
                  {exam.laboratory && (
                    <p className="text-xs text-muted-foreground">{exam.laboratory}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    exam.status === 'processed'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {exam.status === 'processed' ? (
                      <><CheckCircle className="w-3 h-3" /> Analisado</>
                    ) : (
                      <><Clock className="w-3 h-3" /> Pendente</>
                    )}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}