import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Shield,
  Clock,
  AlertCircle,
  CheckCircle,
  FileText,
  Pill,
  User,
  Brain,
  Activity,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface AccessCode {
  id: string
  code: string
  patient_id: string
  permissions: {
    profile?: boolean
    exams?: boolean
    medications?: boolean
    allergies?: boolean
    medscore?: boolean
    ai_analysis?: boolean
  }
  expires_at: string
  created_at: string
}

export default function AccessCode() {
  const { code } = useParams()
  const [loading, setLoading] = useState(true)
  const [accessCode, setAccessCode] = useState<AccessCode | null>(null)
  const [error, setError] = useState('')
  const [patientProfile, setPatientProfile] = useState<any>(null)
  const [exams, setExams] = useState<any[]>([])
  const [medications, setMedications] = useState<any[]>([])

  useEffect(() => {
    loadAccess()
  }, [code])

  async function safeSelect(table: string, patientId: string) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('user_id', patientId)
        .limit(20)

      if (error) return []
      return data || []
    } catch {
      return []
    }
  }

  async function loadAccess() {
    if (!code) {
      setError('Código não informado')
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase
        .from('access_codes')
        .select('*')
        .eq('code', code)
        .single()

      if (error || !data) {
        setError('Código não encontrado')
        setLoading(false)
        return
      }

      const access = data as AccessCode

      if (new Date(access.expires_at) < new Date()) {
        setError('Este código expirou')
        setLoading(false)
        return
      }

      setAccessCode(access)

      if (access.permissions?.profile) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', access.patient_id)
          .maybeSingle()

        setPatientProfile(profileData || null)
      }

      if (access.permissions?.exams || access.permissions?.ai_analysis) {
        const examRows =
          (await safeSelect('exams', access.patient_id)) ||
          (await safeSelect('patient_exams', access.patient_id))
        setExams(examRows)
      }

      if (access.permissions?.medications) {
        const medRows =
          (await safeSelect('medications', access.patient_id)) ||
          (await safeSelect('patient_medications', access.patient_id))
        setMedications(medRows)
      }
    } catch (err) {
      console.error(err)
      setError('Erro ao validar código')
    } finally {
      setLoading(false)
    }
  }

  function formatDate(date?: string) {
    if (!date) return '-'
    return new Date(date).toLocaleString('pt-BR')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm text-center max-w-md w-full">
          <div className="w-12 h-12 rounded-full border-4 border-emerald-600 border-t-transparent animate-spin mx-auto mb-4" />
          <p className="font-semibold">Validando acesso...</p>
          <p className="text-sm text-gray-500 mt-1">
            Aguarde enquanto verificamos o código.
          </p>
        </div>
      </div>
    )
  }

  if (error || !accessCode) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm text-center max-w-md w-full">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-red-600" />
          </div>

          <h1 className="text-xl font-bold mb-2">Acesso indisponível</h1>
          <p className="text-sm text-gray-600">{error}</p>

          <p className="text-xs text-gray-400 mt-5">
            Peça ao paciente para gerar um novo código no HealthWallet.
          </p>
        </div>
      </div>
    )
  }

  const permissions = accessCode.permissions || {}

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>

          <div>
            <h1 className="font-bold leading-tight">HealthWallet</h1>
            <p className="text-xs text-gray-500">
              Acesso profissional autorizado pelo paciente
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-700 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-900">
              Código válido e autorizado
            </p>
            <p className="text-sm text-emerald-700">
              Este acesso foi liberado pelo paciente e expira automaticamente.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-gray-500" />
            <p className="font-semibold">Informações do acesso</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-gray-500 text-xs">Código</p>
              <p className="font-mono font-bold">{accessCode.code}</p>
            </div>

            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-gray-500 text-xs">Expira em</p>
              <p className="font-semibold">{formatDate(accessCode.expires_at)}</p>
            </div>
          </div>
        </div>

        {permissions.profile && (
          <section className="bg-white rounded-2xl border p-4">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-5 h-5 text-emerald-600" />
              <h2 className="font-bold">Perfil do paciente</h2>
            </div>

            {patientProfile ? (
              <div className="space-y-2 text-sm">
                <p>
                  <strong>Nome:</strong>{' '}
                  {patientProfile.full_name ||
                    patientProfile.name ||
                    patientProfile.nome ||
                    'Não informado'}
                </p>
                <p>
                  <strong>E-mail:</strong>{' '}
                  {patientProfile.email || 'Não informado'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Perfil autorizado, mas nenhum dado de perfil foi encontrado.
              </p>
            )}
          </section>
        )}

        {permissions.medscore && (
          <section className="bg-white rounded-2xl border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-5 h-5 text-emerald-600" />
              <h2 className="font-bold">MedScore</h2>
            </div>

            <p className="text-sm text-gray-500">
              Área reservada para exibir o score de saúde do paciente quando o cálculo estiver ativo.
            </p>
          </section>
        )}

        {permissions.exams && (
          <section className="bg-white rounded-2xl border p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-5 h-5 text-emerald-600" />
              <h2 className="font-bold">Exames</h2>
            </div>

            {exams.length > 0 ? (
              <div className="space-y-3">
                {exams.map((exam, index) => (
                  <div key={exam.id || index} className="bg-gray-50 rounded-xl p-3">
                    <p className="font-semibold">
                      {exam.title || exam.name || exam.exam_type || 'Exame'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(exam.created_at || exam.exam_date || exam.date)}
                    </p>
                    {exam.summary ? (
                      <p className="text-sm mt-2">{exam.summary}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Exames autorizados, mas nenhum exame foi encontrado.
              </p>
            )}
          </section>
        )}

        {permissions.ai_analysis && (
          <section className="bg-white rounded-2xl border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-5 h-5 text-emerald-600" />
              <h2 className="font-bold">Análises por IA</h2>
            </div>

            <p className="text-sm text-gray-500">
              As análises de IA autorizadas serão exibidas aqui quando estiverem salvas no histórico do paciente.
            </p>
          </section>
        )}

        {permissions.medications && (
          <section className="bg-white rounded-2xl border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Pill className="w-5 h-5 text-emerald-600" />
              <h2 className="font-bold">Medicamentos</h2>
            </div>

            {medications.length > 0 ? (
              <div className="space-y-3">
                {medications.map((med, index) => (
                  <div key={med.id || index} className="bg-gray-50 rounded-xl p-3">
                    <p className="font-semibold">
                      {med.name || med.medication_name || 'Medicamento'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {med.dosage || med.frequency || med.instructions || 'Sem detalhes'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Medicamentos autorizados, mas nenhum registro foi encontrado.
              </p>
            )}
          </section>
        )}

        {permissions.allergies && (
          <section className="bg-white rounded-2xl border p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <h2 className="font-bold">Alergias</h2>
            </div>

            <p className="text-sm text-gray-500">
              Área reservada para alergias do paciente quando esta tabela estiver conectada.
            </p>
          </section>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-700">
          Este acesso é temporário e limitado às permissões escolhidas pelo paciente no HealthWallet.
        </div>
      </main>
    </div>
  )
}
