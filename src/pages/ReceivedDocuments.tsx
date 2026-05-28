import { useState, useEffect } from 'react'
import { FileText, Mail, Loader2, Clock, Check, Eye, ChevronRight, Trash2, Inbox } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface Document {
  id: string
  document_type: string
  title: string
  content: string | null
  professional_id: string | null
  sent_at: string
  read_at: string | null
  created_at: string
  professional?: {
    full_name: string
    professional_type: string
    professional_register: string
  }
}

const DOCUMENT_TYPES = {
  receita: { label: 'Receita', icon: '💊', color: 'bg-blue-100 text-blue-600' },
  receituario: { label: 'Receituário', icon: '💊', color: 'bg-blue-100 text-blue-600' },
  evolucao: { label: 'Evolução', icon: '📋', color: 'bg-green-100 text-green-600' },
  orientacao: { label: 'Orientação', icon: '📝', color: 'bg-purple-100 text-purple-600' },
  atestado: { label: 'Atestado', icon: '📄', color: 'bg-orange-100 text-orange-600' },
  outro: { label: 'Documento', icon: '📎', color: 'bg-gray-100 text-gray-600' },
}

export default function ReceivedDocuments() {
  const { user } = useAuth()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)

  useEffect(() => {
    if (user) {
      loadDocuments()
    }
  }, [user])

  const loadDocuments = async () => {
    if (!user) return

    setLoading(true)

    try {
      const { data, error } = await supabase
        .from('received_documents')
        .select(`
          *,
          professional:professionals (
            full_name,
            professional_type,
            professional_register
          )
        `)
        .eq('patient_id', user.id)
        .order('sent_at', { ascending: false })

      if (error) throw error

      setDocuments(data || [])
    } catch (err) {
      console.error('Error loading documents:', err)
      toast.error('Erro ao carregar documentos')
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (id: string) => {
    const { error } = await supabase
      .from('received_documents')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)

    if (!error) {
      setDocuments(prev =>
        prev.map(doc =>
          doc.id === id ? { ...doc, read_at: new Date().toISOString() } : doc
        )
      )
    }
  }

  const deleteDocument = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este documento?')) return

    const { error } = await supabase
      .from('received_documents')
      .delete()
      .eq('id', id)

    if (!error) {
      setDocuments(prev => prev.filter(doc => doc.id !== id))
      setSelectedDoc(null)
      toast.success('Documento excluído')
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const unreadCount = documents.filter(d => !d.read_at).length

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Documentos Recebidos</h1>
        <p className="text-sm text-muted-foreground">
          Documentos e orientações enviados pelos profissionais
        </p>
      </div>

      {/* Unread Badge */}
      {unreadCount > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold">
            {unreadCount}
          </div>
          <div>
            <p className="font-medium text-emerald-900">Você tem {unreadCount} novo{unreadCount > 1 ? 's' : ''} documento{unreadCount > 1 ? 's' : ''}</p>
            <p className="text-sm text-emerald-700">Clique para visualizar</p>
          </div>
        </div>
      )}

      {/* Documents List */}
      {documents.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Inbox className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum documento</h3>
          <p className="text-gray-500 text-sm">
            Quando um profissional enviar um documento, ele aparecerá aqui
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => {
            const typeInfo = DOCUMENT_TYPES[doc.document_type as keyof typeof DOCUMENT_TYPES] || DOCUMENT_TYPES.outro
            const isUnread = !doc.read_at

            return (
              <button
                key={doc.id}
                onClick={() => {
                  setSelectedDoc(doc)
                  if (isUnread) markAsRead(doc.id)
                }}
                className={`w-full bg-white rounded-xl border p-4 text-left transition-all hover:shadow-md ${
                  isUnread ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${typeInfo.color}`}>
                    {typeInfo.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-emerald-600" />
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 truncate">{doc.title}</h3>
                    <p className="text-sm text-gray-500 truncate">
                      {doc.professional?.full_name || 'Profissional'}
                      {doc.professional?.professional_register && (
                        <span className="text-gray-400">
                          {' • '}{doc.professional.professional_register}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      {formatDate(doc.sent_at)}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Document Detail Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {DOCUMENT_TYPES[selectedDoc.document_type as keyof typeof DOCUMENT_TYPES]?.icon || '📎'}
                </span>
                <div>
                  <h2 className="font-bold">{selectedDoc.title}</h2>
                  <p className="text-sm text-gray-500">
                    {selectedDoc.professional?.full_name || 'Profissional'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Metadata */}
              <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tipo:</span>
                  <span className="font-medium">
                    {DOCUMENT_TYPES[selectedDoc.document_type as keyof typeof DOCUMENT_TYPES]?.label}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Enviado em:</span>
                  <span className="font-medium">{formatDate(selectedDoc.sent_at)}</span>
                </div>
                {selectedDoc.read_at && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Visualizado em:</span>
                    <span className="font-medium">{formatDate(selectedDoc.read_at)}</span>
                  </div>
                )}
              </div>

              {/* Content */}
              {selectedDoc.content ? (
                <div className="bg-white border rounded-xl p-4">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700">
                    {selectedDoc.content}
                  </pre>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Este documento não possui conteúdo de texto</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t flex gap-3">
              <button
                onClick={() => deleteDocument(selectedDoc.id)}
                className="flex-1 py-3 rounded-xl border border-red-200 text-red-600 font-medium hover:bg-red-50 flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Excluir
              </button>
              <button
                onClick={() => setSelectedDoc(null)}
                className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
