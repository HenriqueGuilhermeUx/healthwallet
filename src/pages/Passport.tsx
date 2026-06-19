import { useEffect, useState } from 'react'
import {
  Shield,
  Pill,
  AlertTriangle,
  Phone,
  QrCode,
  CreditCard,
  Copy,
  Check,
  HeartPulse,
  FileText,
  ClipboardList,
  Stethoscope,
  User,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { createProfessionalShare } from '@/services/shareAccess'

export default function Passport() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<any>({})
  const [medications, setMedications] = useState<any[]>([])
  const [conditions, setConditions] = useState<any[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [exams, setExams] = useState<any[]>([])
  const [shareCode, setShareCode] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    load()
  }, [user])

  async function load() {
    if (!user) return

    const { data: dbProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (dbProfile) {
      setProfile({
        fullName:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          'Usuário',
        birthDate: dbProfile.birth_date,
        gender: dbProfile.gender,
        bloodType: dbProfile.blood_type,
        weight: dbProfile.weight,
        height: dbProfile.height,
        phone: dbProfile.phone,
        allergies: dbProfile.allergies || [],
        chronicConditions: dbProfile.chronic_conditions,
        currentMedications: dbProfile.current_medications,
        familyHistory: dbProfile.family_history,
        medScore: dbProfile.med_score,
        surgeries: dbProfile.surgeries,
        emergencyContactName: dbProfile.emergency_contact_name,
        emergencyContactPhone: dbProfile.emergency_contact_phone,
        emergencyContactRelationship: dbProfile.emergency_contact_relationship,
      })
    }

    const [medsRes, conditionsRes, plansRes, examsRes] = await Promise.all([
      supabase.from('medications').select('*').eq('user_id', user.id),
      supabase.from('patient_conditions').select('*').eq('user_id', user.id),
      supabase.from('health_plans').select('*').eq('user_id', user.id),
      supabase
        .from('medical_records')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    setMedications(medsRes.data || [])
    setConditions(conditionsRes.data || [])
    setPlans(plansRes.data || [])
    setExams(examsRes.data || [])
  }

  async function generateEmergencyCode() {
    if (!user) return
    const share = await createProfessionalShare(user.id)
    setShareCode(share.access_code)
  }

  async function copyCode() {
    if (!shareCode) return
    await navigator.clipboard.writeText(shareCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const allergies = Array.isArray(profile.allergies)
    ? profile.allergies
    : profile.allergies
      ? String(profile.allergies).split(',').map((item) => item.trim()).filter(Boolean)
      : []

  const missingFields = [
    !profile.birthDate && 'Data de nascimento',
    !profile.bloodType && 'Tipo sanguíneo',
    !profile.weight && 'Peso',
    !profile.height && 'Altura',
    !profile.phone && 'Telefone',
    !profile.emergencyContactName && 'Contato de emergência',
    allergies.length === 0 && 'Alergias',
    !profile.currentMedications && medications.length === 0 && 'Medicamentos atuais',
    !profile.surgeries && 'Cirurgias / internações',
  ].filter(Boolean)

  return (
    <div className="p-4 pb-20 space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-6">
        <div className="flex items-center gap-3 mb-4">
          <ClipboardList className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Prontuário Digital</h1>
            <p className="text-white/80 text-sm">
              Histórico completo de consultas, exames, prescrições e dados de emergência.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <MiniStat label="Exames" value={exams.length} />
          <MiniStat label="Remédios" value={medications.length} />
          <MiniStat label="Planos" value={plans.length} />
        </div>
      </div>

      {missingFields.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-700 mt-0.5" />
            <div className="flex-1">
              <h2 className="font-bold text-yellow-900 mb-2">
                Complete seu prontuário
              </h2>

              <div className="flex flex-wrap gap-2 mb-3">
                {missingFields.map((item: any) => (
                  <span key={item} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                    {item}
                  </span>
                ))}
              </div>

              <a
                href="/profile"
                className="inline-flex px-4 py-2 rounded-xl bg-yellow-600 text-white text-sm font-medium"
              >
                Atualizar agora
              </a>
            </div>
          </div>
        </div>
      )}

      <Section icon={User} title="Identificação">
        <Info label="Nome" value={profile.fullName || user?.email} />
        <Info label="Nascimento" value={profile.birthDate} />
        <Info label="Telefone" value={profile.phone} />
        <Info label="Peso" value={profile.weight ? `${profile.weight} kg` : ''} />
        <Info label="Altura" value={profile.height ? `${profile.height} cm` : ''} />
        <Info label="Tipo sanguíneo" value={profile.bloodType} />
        <Info label="MedScore" value={profile.medScore ? `${profile.medScore}/100` : 'Não calculado'} />
      </Section>

      <Section icon={Phone} title="Contato de Emergência" danger>
        {profile.emergencyContactName ? (
          <>
            <Info label="Nome" value={profile.emergencyContactName} />
            <Info label="Telefone" value={profile.emergencyContactPhone} />
            <Info label="Parentesco" value={profile.emergencyContactRelationship} />
          </>
        ) : (
          <Empty text="Nenhum contato de emergência cadastrado." />
        )}

        <a href="/profile" className="block mt-3 text-center py-2 rounded-xl bg-red-600 text-white text-sm font-medium">
          Editar contato de emergência
        </a>
      </Section>

      <Section icon={HeartPulse} title="Resumo Clínico">
        <Info label="Alergias" value={allergies.length > 0 ? allergies.join(', ') : ''} />
        <Info label="Condições" value={profile.chronicConditions} />
        <Info label="Medicamentos" value={profile.currentMedications} />
        <Info label="Histórico familiar" value={profile.familyHistory} />
        <Info label="Cirurgias / internações" value={profile.surgeries} />
      </Section>

      <Section icon={FileText} title="Exames recentes">
        {exams.length > 0 ? (
          exams.map((exam) => (
            <div key={exam.id} className="border-b py-2 text-sm">
              <p className="font-medium">{exam.file_name || exam.exam_type || 'Exame'}</p>
              <p className="text-xs text-gray-500">
                {exam.status === 'processed' ? 'Analisado' : 'Pendente'} ·{' '}
                {new Date(exam.created_at).toLocaleDateString('pt-BR')}
              </p>
              {exam.ai_analysis && (
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                  {exam.ai_analysis}
                </p>
              )}
            </div>
          ))
        ) : (
          <Empty text="Nenhum exame cadastrado." />
        )}

        <a href="/upload" className="block mt-3 text-center py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium">
          Enviar exame
        </a>
      </Section>

      <Section icon={Pill} title="Prescrições / Medicamentos">
        {medications.length > 0 ? (
          medications.map((med) => (
            <p key={med.id} className="text-sm border-b py-2">
              {med.name || med.medication_name || 'Medicamento'} {med.dosage || ''}
            </p>
          ))
        ) : profile.currentMedications ? (
          <p className="text-sm text-gray-700">{profile.currentMedications}</p>
        ) : (
          <Empty text="Nenhum medicamento cadastrado." />
        )}
      </Section>

      <Section icon={Stethoscope} title="Condições / Consultas">
        {conditions.length > 0 ? (
          conditions.map((item) => (
            <p key={item.id} className="text-sm border-b py-2">
              {item.name || item.condition || item.title || 'Condição'}
            </p>
          ))
        ) : profile.chronicConditions ? (
          <p className="text-sm text-gray-700">{profile.chronicConditions}</p>
        ) : (
          <Empty text="Nenhuma condição cadastrada." />
        )}
      </Section>

      <Section icon={CreditCard} title="Carteirinhas / Plano">
        {plans.length > 0 ? (
          plans.map((plan) => (
            <div key={plan.id} className="border-b py-2 text-sm">
              <p><strong>Plano:</strong> {plan.plan_name}</p>
              {plan.operator_name && <p><strong>Operadora:</strong> {plan.operator_name}</p>}
              <p><strong>Número:</strong> {plan.card_number}</p>
              <p><strong>Titular:</strong> {plan.beneficiary_name}</p>
              {plan.validity && <p><strong>Validade:</strong> {plan.validity}</p>}
            </div>
          ))
        ) : (
          <Empty text="Nenhuma carteirinha cadastrada." />
        )}
      </Section>

      <Section icon={QrCode} title="Compartilhamento médico">
        <button
          onClick={generateEmergencyCode}
          className="w-full bg-emerald-600 text-white py-3 rounded-xl font-medium"
        >
          Gerar código de acesso
        </button>

        {shareCode && (
          <div className="mt-4 text-center bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <p className="text-sm text-emerald-700">Código:</p>
            <p className="text-3xl font-bold tracking-widest text-emerald-900">{shareCode}</p>

            <button
              onClick={copyCode}
              className="mt-3 w-full bg-white border border-emerald-300 text-emerald-700 py-2 rounded-xl font-medium flex items-center justify-center gap-2"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copiado!' : 'Copiar código'}
            </button>
          </div>
        )}
      </Section>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-700" />
        <p className="text-xs text-yellow-800">
          Em emergência real, ligue para o serviço de emergência local. Este prontuário é apoio informativo e não substitui avaliação médica.
        </p>
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, children, danger }: any) {
  return (
    <div className={`rounded-xl border p-4 bg-white ${danger ? 'border-red-200' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-5 h-5 ${danger ? 'text-red-600' : 'text-emerald-600'}`} />
        <h2 className={`font-bold ${danger ? 'text-red-700' : ''}`}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Info({ label, value }: any) {
  return (
    <p className="text-sm py-1">
      <strong>{label}:</strong> {value || 'Não informado'}
    </p>
  )
}

function Empty({ text }: any) {
  return <p className="text-sm text-gray-500">{text}</p>
}

function MiniStat({ label, value }: any) {
  return (
    <div className="bg-white/20 rounded-xl p-3 text-center">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-white/80">{label}</p>
    </div>
  )
}
