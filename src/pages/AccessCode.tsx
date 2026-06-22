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
  HeartPulse,
  CreditCard,
  Phone,
  Users,
  Stethoscope,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface AccessCode {
  id: string
  code: string
  patient_id: string
  permissions?: Record<string, boolean>
  share_categories?: Record<string, boolean>
  expires_at: string
  created_at: string
  revoked?: boolean
}

export default function AccessCode() {
  const { code } = useParams()
  const [loading, setLoading] = useState(true)
  const [accessCode, setAccessCode] = useState<AccessCode | null>(null)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const [patientProfile, setPatientProfile] = useState<any>(null)
  const [summary, setSummary] = useState<any>(null)
  const [score, setScore] = useState<any>(null)
  const [exams, setExams] = useState<any[]>([])
  const [medications, setMedications] = useState<any[]>([])
  const [healthPlans, setHealthPlans] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])

  useEffect(() => {
    loadAccess()
  }, [code])

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

      if (access.revoked) {
        setError('Este acesso foi revogado pelo paciente')
        setLoading(false)
        return
      }

      if (access.expires_at && new Date(access.expires_at) < new Date()) {
        setError('Este código expirou')
        setLoading(false)
        return
      }

      const allowed = {
        ...(access.permissions || {}),
        ...(access.share_categories || {}),
      }

      setAccessCode(access)
      setPermissions(allowed)

      const shouldLoadProfile =
        allowed.profile ||
        allowed.passport ||
        allowed.allergies ||
        allowed.emergency_contact ||
        allowed.family_history

      if (shouldLoadProfile) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', access.patient_id)
          .maybeSingle()

        setPatientProfile(profileData || null)
      }

      if (allowed.summary) {
        const { data: summaryData } = await supabase
          .from('health_summaries')
          .select('*')
          .eq('user_id', access.patient_id)
          .maybeSingle()

        setSummary(summaryData || null)
      }

      if (allowed.medscore) {
        const { data: scoreData } = await supabase
          .from('health_scores')
          .select('*')
          .eq('user_id', access.patient_id)
          .order('calculated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        setScore(scoreData || null)
      }

      if (allowed.exams || allowed.ai_analysis) {
        const { data: examData } = await supabase
          .from('medical_records')
          .select('*')
          .eq('user_id', access.patient_id)
          .order('created_at', { ascending: false })
          .limit(20)

        setExams(examData || [])
      }

      if (allowed.medications) {
        const { data: medData } = await supabase
          .from('medications')
          .select('*')
          .eq('user_id', access.patient_id)
          .order('created_at', { ascending: false })
          .limit(20)

        setMedications(medData || [])
      }

      if (allowed.health_plan) {
        const { data: planData } = await supabase
          .from('health_plans')
          .select('*')
          .eq('user_id', access.patient_id)
          .order('created_at', { ascending: false })
          .limit(20)

        setHealthPlans(planData || [])
      }

      if (allowed.passport) {
        const { data: recordData } = await supabase
          .from('medical_events')
          .select('*')
          .eq('user_id', access.patient_id)
          .order('event_date', { ascending: false })
          .limit(10)

        setRecords(recordData || [])
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

  const patientName =
    patientProfile?.full_name ||
    patientProfile?.name ||
    patientProfile?.nome ||
    'Paciente HealthWallet'

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
              Este acesso foi liberado pelo paciente e respeita as categorias autorizadas.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-gray-500" />
            <p className="font-semibold">Informações do acesso</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Info label="Código" value={accessCode.code} mono />
            <Info label="Expira em" value={formatDate(accessCode.expires_at)} />
            <Info label="Paciente" value={patientName} />
            <Info
              label="Categorias autorizadas"
              value={Object.keys(permissions).filter((key) => permissions[key]).length.toString()}
            />
          </div>
        </div>

        {permissions.profile && (
          <Section icon={User} title="Perfil do paciente">
            {patientProfile ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <Info label="Nome" value={patientName} />
                <Info label="Sexo" value={translateGender(patientProfile.gender)} />
                <Info label="Nascimento" value={patientProfile.birth_date || 'Não informado'} />
                <Info label="Tipo sanguíneo" value={patientProfile.blood_type || 'Não informado'} />
                <Info label="Peso" value={patientProfile.weight ? `${patientProfile.weight} kg` : 'Não informado'} />
                <Info label="Altura" value={patientProfile.height ? `${patientProfile.height} cm` : 'Não informado'} />
              </div>
            ) : (
              <Empty text="Perfil autorizado, mas nenhum dado foi encontrado." />
            )}
          </Section>
        )}

        {permissions.passport && (
          <Section icon={Shield} title="Passport / Prontuário resumido">
            <div className="space-y-3 text-sm">
              <Info label="Paciente" value={patientName} />
              <Info label="Tipo sanguíneo" value={patientProfile?.blood_type || 'Não informado'} />
              <Info label="Condições" value={patientProfile?.chronic_conditions || 'Não informado'} />
              <Info label="Medicamentos atuais" value={patientProfile?.current_medications || 'Não informado'} />

              {records.length > 0 ? (
                <div>
                  <p className="text-gray-500 text-xs mb-2">Últimos eventos clínicos</p>
                  <div className="space-y-2">
                    {records.slice(0, 5).map((item, index) => (
                      <div key={item.id || index} className="bg-gray-50 rounded-xl p-3">
                        <p className="font-semibold">{item.title || 'Evento clínico'}</p>
                        <p className="text-xs text-gray-500">{formatDate(item.event_date)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Section>
        )}

        {permissions.summary && (
          <Section icon={FileText} title="Resumo profissional">
            {summary?.professional_summary || summary?.summary ? (
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
                {summary.professional_summary || summary.summary}
              </pre>
            ) : (
              <Empty text="Resumo autorizado, mas nenhum resumo foi encontrado." />
            )}
          </Section>
        )}

        {permissions.medscore && (
          <Section icon={Activity} title="MedScore">
            {score ? (
              <div className="space-y-3">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                  <p className="text-sm text-emerald-700">Score atual</p>
                  <p className="text-4xl font-bold text-emerald-900">{score.score}/100</p>
                  <p className="text-sm text-emerald-700">{score.status || 'Sem status'}</p>
                </div>
                {score.factors?.alerts?.length > 0 && (
                  <div>
                    <p className="font-semibold text-sm mb-2">Pontos de atenção</p>
                    <ul className="list-disc pl-5 text-sm text-gray-700">
                      {score.factors.alerts.map((item: string, idx: number) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <Empty text="MedScore autorizado, mas nenhum score foi encontrado." />
            )}
          </Section>
        )}

        {permissions.exams && (
          <Section icon={FileText} title="Exames">
            {exams.length > 0 ? (
              <div className="space-y-3">
                {exams.map((exam, index) => (
                  <div key={exam.id || index} className="bg-gray-50 rounded-xl p-3">
                    <p className="font-semibold">
                      {exam.file_name || exam.title || exam.exam_type || 'Exame'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(exam.created_at || exam.exam_date || exam.date)}
                    </p>
                    {exam.ai_result?.summary ? (
                      <p className="text-sm mt-2">{exam.ai_result.summary}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="Exames autorizados, mas nenhum exame foi encontrado." />
            )}
          </Section>
        )}

        {permissions.ai_analysis && (
          <Section icon={Brain} title="Análises por IA">
            {exams.some((exam) => exam.ai_result) ? (
              <div className="space-y-3">
                {exams
                  .filter((exam) => exam.ai_result)
                  .map((exam, index) => (
                    <div key={exam.id || index} className="bg-gray-50 rounded-xl p-3">
                      <p className="font-semibold">
                        {exam.file_name || exam.exam_type || 'Exame analisado'}
                      </p>
                      <p className="text-sm mt-2">
                        {exam.ai_result?.summary || exam.ai_result?.clinicalSummary || 'Análise disponível.'}
                      </p>
                    </div>
                  ))}
              </div>
            ) : (
              <Empty text="Análise IA autorizada, mas nenhuma análise foi encontrada." />
            )}
          </Section>
        )}

        {permissions.medications && (
          <Section icon={Pill} title="Medicamentos">
            {medications.length > 0 ? (
              <div className="space-y-3">
                {medications.map((med, index) => (
                  <div key={med.id || index} className="bg-gray-50 rounded-xl p-3">
                    <p className="font-semibold">
                      {med.name || med.medication_name || 'Medicamento'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {[med.dosage, med.frequency].filter(Boolean).join(' · ') || 'Sem detalhes'}
                    </p>
                    {med.reminder_time && (
                      <p className="text-xs text-gray-500 mt-1">
                        Horário: {String(med.reminder_time).slice(0, 5)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="Medicamentos autorizados, mas nenhum registro foi encontrado." />
            )}
          </Section>
        )}

        {permissions.allergies && (
          <Section icon={AlertCircle} title="Alergias">
            <p className="text-sm text-gray-700">
              {formatArrayOrText(patientProfile?.allergies) || 'Nenhuma alergia informada.'}
            </p>
          </Section>
        )}

        {permissions.emergency_contact && (
          <Section icon={Phone} title="Contato de emergência">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Info label="Nome" value={patientProfile?.emergency_contact_name || 'Não informado'} />
              <Info label="Telefone" value={patientProfile?.emergency_contact_phone || 'Não informado'} />
              <Info label="Parentesco" value={patientProfile?.emergency_contact_relationship || 'Não informado'} />
            </div>
          </Section>
        )}

        {permissions.health_plan && (
          <Section icon={CreditCard} title="Plano/SUS">
            {healthPlans.length > 0 ? (
              <div className="space-y-3">
                {healthPlans.map((plan, index) => (
                  <div key={plan.id || index} className="bg-gray-50 rounded-xl p-3">
                    <p className="font-semibold">
                      {plan.plan_name || plan.name || plan.provider || 'Carteira'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {plan.card_number || plan.sus_number || plan.number || 'Número não informado'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="Plano/SUS autorizado, mas nenhuma carteira foi encontrada." />
            )}
          </Section>
        )}

        {permissions.family_history && (
          <Section icon={Users} title="Histórico familiar">
            <p className="text-sm text-gray-700">
              {patientProfile?.family_history || 'Histórico familiar não informado.'}
            </p>
          </Section>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-700">
          Este acesso é temporário e limitado às permissões escolhidas pelo paciente no HealthWallet.
        </div>
      </main>
    </div>
  )
}

function Section({ icon: Icon, title, children }: any) {
  return (
    <section className="bg-white rounded-2xl border p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5 text-emerald-600" />
        <h2 className="font-bold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Info({ label, value, mono }: any) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className="text-gray-500 text-xs">{label}</p>
      <p className={`${mono ? 'font-mono' : 'font-semibold'} break-words`}>
        {value || 'Não informado'}
      </p>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-gray-500">{text}</p>
}

function formatArrayOrText(value: any) {
  if (Array.isArray(value)) return value.join(', ')
  return value || ''
}

function translateGender(value?: string) {
  if (value === 'male') return 'Masculino'
  if (value === 'female') return 'Feminino'
  if (value === 'other') return 'Outro'
  return value || 'Não informado'
}
