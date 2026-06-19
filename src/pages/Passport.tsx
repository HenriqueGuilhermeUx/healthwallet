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
  Siren,
  Upload,
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
        .limit(5),
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

  const activeMedications = medications.filter((med) => med.is_active !== false)

  const criticalMeds = activeMedications.length
    ? activeMedications
    : profile.currentMedications
      ? [{ id: 'profile-med', name: profile.currentMedications, dosage: '' }]
      : []

  const mainPlan = plans[0]

  const missingFields = [
    !profile.bloodType && 'Tipo sanguíneo',
    !profile.emergencyContactName && 'Contato de emergência',
    allergies.length === 0 && 'Alergias',
    criticalMeds.length === 0 && 'Medicamentos',
    !mainPlan && 'Plano/SUS',
    !profile.phone && 'Telefone',
    !profile.weight && 'Peso',
    !profile.height && 'Altura',
    !profile.surgeries && 'Cirurgias / internações',
  ].filter(Boolean)

  return (
    <div className="p-4 pb-20 space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 text-white p-6">
        <div className="flex items-center gap-3 mb-4">
          <Siren className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Passaporte de Emergência</h1>
            <p className="text-white/80 text-sm">
              Informações essenciais para atendimento rápido.
            </p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <p><strong>Nome:</strong> {profile.fullName || user?.email || 'Não informado'}</p>
          <p><strong>Tipo sanguíneo:</strong> {profile.bloodType || 'Não informado'}</p>
          <p><strong>Alergias:</strong> {allergies.length ? allergies.join(', ') : 'Não informado'}</p>
          <p><strong>Medicamentos:</strong> {formatMedsShort(criticalMeds)}</p>
        </div>
      </div>

      <section className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Phone className="w-5 h-5 text-red-600" />
          <h2 className="font-bold text-red-800">Contato de emergência</h2>
        </div>

        {profile.emergencyContactName ? (
          <div className="space-y-1 text-sm text-red-900">
            <p className="font-bold text-lg">{profile.emergencyContactName}</p>
            <p><strong>Telefone:</strong> {profile.emergencyContactPhone || 'Não informado'}</p>
            <p><strong>Parentesco:</strong> {profile.emergencyContactRelationship || 'Não informado'}</p>
          </div>
        ) : (
          <p className="text-sm text-red-700">Nenhum contato de emergência cadastrado.</p>
        )}

        <a
          href="/profile"
          className="block mt-3 text-center py-2 rounded-xl bg-red-600 text-white text-sm font-medium"
        >
          Atualizar contato
        </a>
      </section>

      {mainPlan && (
        <section className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-blue-900">Plano/SUS</h2>
          </div>

          <div className="text-sm text-blue-900 space-y-1">
            <p><strong>{mainPlan.plan_type === 'sus' ? 'SUS' : 'Plano'}:</strong> {mainPlan.plan_name}</p>
            {mainPlan.operator_name && <p><strong>Operadora:</strong> {mainPlan.operator_name}</p>}
            <p><strong>Número:</strong> {mainPlan.card_number}</p>
            <p><strong>Titular:</strong> {mainPlan.beneficiary_name}</p>
          </div>
        </section>
      )}

      {missingFields.length > 0 && (
        <section className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-700 mt-0.5" />

            <div className="flex-1">
              <h2 className="font-bold text-yellow-900 mb-2">
                Informações faltantes
              </h2>

              <div className="flex flex-wrap gap-2 mb-3">
                {missingFields.map((item: any) => (
                  <span
                    key={item}
                    className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full"
                  >
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
        </section>
      )}

      <section className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-5">
        <div className="flex items-center gap-3 mb-4">
          <ClipboardList className="w-7 h-7" />
          <div>
            <h2 className="text-xl font-bold">Prontuário Digital</h2>
            <p className="text-white/80 text-sm">
              Resumo clínico, exames, prescrições e histórico.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Exames" value={exams.length} />
          <MiniStat label="Remédios" value={activeMedications.length} />
          <MiniStat label="Planos" value={plans.length} />
        </div>
      </section>

      <Section icon={User} title="Identificação resumida">
        <Info label="Nome" value={profile.fullName || user?.email} />
        <Info label="Nascimento" value={profile.birthDate} />
        <Info label="Telefone" value={profile.phone} />
        <Info label="Peso" value={profile.weight ? `${profile.weight} kg` : ''} />
        <Info label="Altura" value={profile.height ? `${profile.height} cm` : ''} />
        <Info label="MedScore" value={profile.medScore ? `${profile.medScore}/100` : 'Não calculado'} />
      </Section>

      <Section icon={HeartPulse} title="Resumo clínico">
        <Info label="Condições" value={profile.chronicConditions} />
        <Info label="Histórico familiar" value={profile.familyHistory} />
        <Info label="Cirurgias / internações" value={profile.surgeries} />
      </Section>

      <Section icon={Pill} title="Medicamentos críticos / em uso">
        {criticalMeds.length > 0 ? (
          criticalMeds.map((med: any) => (
            <p key={med.id || med.name} className="text-sm border-b py-2">
              {med.name || med.medication_name || 'Medicamento'} {med.dosage || ''}
              {med.frequency ? ` · ${med.frequency}` : ''}
            </p>
          ))
        ) : (
          <Empty text="Nenhum medicamento cadastrado." />
        )}
      </Section>

      <Section icon={FileText} title="Últimos exames">
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

        <a
          href="/upload"
          className="block mt-3 text-center py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium"
        >
          Enviar exame
        </a>
      </Section>

      <Section icon={Stethoscope} title="Condições cadastradas">
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

      <Section icon={CreditCard} title="Carteiras Plano/SUS">
        {plans.length > 0 ? (
          plans.map((plan) => (
            <div key={plan.id} className="border-b py-2 text-sm">
              <p><strong>{plan.plan_type === 'sus' ? 'SUS' : 'Plano'}:</strong> {plan.plan_name}</p>
              {plan.operator_name && <p><strong>Operadora:</strong> {plan.operator_name}</p>}
              <p><strong>Número:</strong> {plan.card_number}</p>
              <p><strong>Titular:</strong> {plan.beneficiary_name}</p>
              {plan.validity && <p><strong>Validade:</strong> {plan.validity}</p>}
            </div>
          ))
        ) : (
          <Empty text="Nenhuma carteira cadastrada." />
        )}

        <a
          href="/wallet"
          className="block mt-3 text-center py-2 rounded-xl bg-blue-600 text-white text-sm font-medium"
        >
          Adicionar Plano/SUS
        </a>
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
          Em emergência real, ligue para o serviço de emergência local. Este passaporte é apoio informativo e não substitui avaliação médica.
        </p>
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, children }: any) {
  return (
    <div className="rounded-xl border p-4 bg-white">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5 text-emerald-600" />
        <h2 className="font-bold">{title}</h2>
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

function formatMedsShort(meds: any[]) {
  if (!meds.length) return 'Não informado'

  return meds
    .slice(0, 3)
    .map((med) => `${med.name || med.medication_name || 'Medicamento'} ${med.dosage || ''}`.trim())
    .join(', ')
}
