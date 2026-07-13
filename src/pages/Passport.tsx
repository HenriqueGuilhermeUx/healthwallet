import { useEffect, useState } from 'react'
import {
  Pill,
  AlertTriangle,
  Phone,
  QrCode,
  CreditCard,
  Copy,
  Check,
  HeartPulse,
  FileText,
  Stethoscope,
  Siren,
  Droplets,
  Shield,
  User,
  Calendar,
  Building2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { createProfessionalShare } from '@/services/shareAccess'

function onlyDigits(value: string) {
  return String(value || '').replace(/\D/g, '')
}

function formatCns(value: string) {
  const digits = onlyDigits(value)
  if (!digits) return ''
  return digits.replace(/(\d{3})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4')
}

export default function Passport() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<any>({})
  const [medications, setMedications] = useState<any[]>([])
  const [conditions, setConditions] = useState<any[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [exams, setExams] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
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
        cpf: dbProfile.cpf,
        cnsNumber: dbProfile.cns_number || dbProfile.sus_card_number,
        susMunicipality: dbProfile.sus_municipality,
        susUbsReference: dbProfile.sus_ubs_reference,
        susFamilyHealthTeam: dbProfile.sus_family_health_team,
        susLocalRecordNumber: dbProfile.sus_local_record_number,
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

    const [medsRes, conditionsRes, plansRes, examsRes, eventsRes] = await Promise.all([
      supabase.from('medications').select('*').eq('user_id', user.id),
      supabase.from('patient_conditions').select('*').eq('user_id', user.id),
      supabase.from('health_plans').select('*').eq('user_id', user.id),
      supabase.from('medical_records').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('medical_events').select('*').eq('user_id', user.id).order('event_date', { ascending: false }).limit(5),
    ])

    setMedications(medsRes.data || [])
    setConditions(conditionsRes.data || [])
    setPlans(plansRes.data || [])
    setExams(examsRes.data || [])
    setEvents(eventsRes.data || [])
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

  const lastConsultation = events.find((event) => ['consultation', 'return'].includes(event.type))
  const cnsFormatted = formatCns(profile.cnsNumber)

  const missingFields = [
    !profile.bloodType && 'Tipo sanguíneo',
    !profile.emergencyContactName && 'Contato de emergência',
    allergies.length === 0 && 'Alergias',
    criticalMeds.length === 0 && 'Medicamentos',
    plans.length === 0 && 'Plano/SUS',
    !profile.phone && 'Telefone',
    !profile.cnsNumber && 'CNS / Cartão SUS',
  ].filter(Boolean)

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 text-white p-5">
        <div className="flex items-center gap-3 mb-4">
          <Siren className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Passaporte 3.0</h1>
            <p className="text-white/80 text-sm">Emergência, prontuário resumido, CNS/Cartão SUS e Plano/SUS em cards.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <EmergencyMiniCard icon={User} label="Nome" value={profile.fullName || user?.email || 'Não informado'} />
          <EmergencyMiniCard icon={CreditCard} label="CNS / Cartão SUS" value={cnsFormatted || 'Não informado'} />
          <EmergencyMiniCard icon={Droplets} label="Tipo sanguíneo" value={profile.bloodType || 'Não informado'} />
          <EmergencyMiniCard icon={AlertTriangle} label="Alergias" value={allergies.length ? allergies.join(', ') : 'Não informado'} />
          <EmergencyMiniCard icon={Pill} label="Medicamentos" value={formatMedsShort(criticalMeds)} />
          <EmergencyMiniCard icon={Building2} label="UBS" value={profile.susUbsReference || 'Não informado'} />
        </div>
      </div>

      <section className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="w-5 h-5 text-blue-700" />
          <h2 className="font-bold text-blue-950">Identificação SUS / município</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <InfoCard icon={CreditCard} label="CNS / Cartão SUS" value={cnsFormatted} />
          <InfoCard icon={Shield} label="CPF" value={profile.cpf} />
          <InfoCard icon={Building2} label="Município" value={profile.susMunicipality} />
          <InfoCard icon={Stethoscope} label="UBS referência" value={profile.susUbsReference} />
          <InfoCard icon={UsersIconSafe} label="Equipe / agente" value={profile.susFamilyHealthTeam} />
          <InfoCard icon={FileText} label="Prontuário local" value={profile.susLocalRecordNumber} />
        </div>
        <p className="text-xs text-blue-800 mt-3">
          Vínculo complementar informado pelo cidadão, familiar ou município. Não representa consulta automática ao SUS nesta fase.
        </p>
        <a href="/profile" className="block mt-3 text-center py-2 rounded-xl bg-blue-600 text-white text-sm font-medium">Atualizar CNS/Cartão SUS</a>
      </section>

      <section className="bg-red-50 border border-red-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Phone className="w-5 h-5 text-red-600" />
          <h2 className="font-bold text-red-900">Contato de emergência</h2>
        </div>
        {profile.emergencyContactName ? (
          <div className="bg-white rounded-xl border border-red-100 p-4">
            <p className="text-lg font-bold text-red-900">{profile.emergencyContactName}</p>
            <p className="text-sm text-red-800">{profile.emergencyContactRelationship || 'Parentesco não informado'}</p>
            <p className="text-sm text-red-800 mt-1">{profile.emergencyContactPhone || 'Telefone não informado'}</p>
          </div>
        ) : <Empty text="Nenhum contato de emergência cadastrado." />}
        <a href="/profile" className="block mt-3 text-center py-2 rounded-xl bg-red-600 text-white text-sm font-medium">Atualizar contato</a>
      </section>

      {missingFields.length > 0 && (
        <section className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-700 mt-0.5" />
            <div className="flex-1">
              <h2 className="font-bold text-yellow-900 mb-2">Informações faltantes</h2>
              <div className="flex flex-wrap gap-2 mb-3">
                {missingFields.map((item: any) => (
                  <span key={item} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">{item}</span>
                ))}
              </div>
              <a href="/profile" className="inline-flex px-4 py-2 rounded-xl bg-yellow-600 text-white text-sm font-medium">Atualizar agora</a>
            </div>
          </div>
        </section>
      )}

      <section className="bg-white rounded-2xl border p-4">
        <div className="flex items-center gap-2 mb-4">
          <HeartPulse className="w-5 h-5 text-emerald-600" />
          <h2 className="font-bold">Prontuário resumido</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <InfoCard icon={Shield} label="MedScore" value={profile.medScore ? `${profile.medScore}/100` : 'Não calculado'} />
          <InfoCard icon={Stethoscope} label="Condições" value={conditions.length ? `${conditions.length} cadastrada(s)` : profile.chronicConditions || 'Não informado'} />
          <InfoCard icon={FileText} label="Últimos exames" value={exams.length ? `${exams.length} recente(s)` : 'Nenhum exame'} />
          <InfoCard icon={Calendar} label="Última consulta" value={lastConsultation ? formatDate(lastConsultation.event_date) : 'Não informado'} />
        </div>
      </section>

      <section className="bg-white rounded-2xl border p-4">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-5 h-5 text-blue-600" />
          <h2 className="font-bold">Plano/SUS</h2>
        </div>
        {plans.length > 0 ? (
          <div className="space-y-3">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-xl border bg-blue-50 border-blue-100 p-4 text-sm text-blue-900">
                <p className="font-bold">{plan.plan_type === 'sus' ? 'SUS' : plan.operator_name || 'Plano de saúde'}</p>
                <p>{plan.plan_name || 'Carteira cadastrada'}</p>
                <p className="mt-1"><strong>Número:</strong> {plan.card_number || 'Não informado'}</p>
                <p><strong>Titular:</strong> {plan.beneficiary_name || 'Não informado'}</p>
                {plan.validity && <p><strong>Validade:</strong> {plan.validity}</p>}
              </div>
            ))}
          </div>
        ) : <Empty text="Nenhuma carteira Plano/SUS cadastrada." />}
        <a href="/wallet" className="block mt-3 text-center py-2 rounded-xl bg-blue-600 text-white text-sm font-medium">Adicionar Plano/SUS</a>
      </section>

      <section className="bg-white rounded-2xl border p-4">
        <div className="flex items-center gap-2 mb-4">
          <Pill className="w-5 h-5 text-orange-600" />
          <h2 className="font-bold">Medicamentos críticos / em uso</h2>
        </div>
        {criticalMeds.length > 0 ? (
          <div className="space-y-2">
            {criticalMeds.slice(0, 5).map((med: any) => (
              <div key={med.id || med.name} className="rounded-xl border bg-orange-50 border-orange-100 p-3 text-sm">
                <p className="font-semibold">{med.name || med.medication_name || 'Medicamento'}</p>
                <p className="text-gray-600">{[med.dosage, med.frequency].filter(Boolean).join(' · ') || 'Sem detalhes'}</p>
              </div>
            ))}
          </div>
        ) : <Empty text="Nenhum medicamento cadastrado." />}
      </section>

      <section className="bg-white rounded-2xl border p-4">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-emerald-600" />
          <h2 className="font-bold">Últimos exames</h2>
        </div>
        {exams.length > 0 ? (
          <div className="space-y-2">
            {exams.slice(0, 5).map((exam) => (
              <div key={exam.id} className="rounded-xl border p-3 text-sm">
                <p className="font-semibold">{exam.file_name || exam.exam_type || 'Exame'}</p>
                <p className="text-xs text-gray-500">{exam.status === 'processed' ? 'Analisado' : 'Pendente'} · {formatDate(exam.created_at)}</p>
              </div>
            ))}
          </div>
        ) : <Empty text="Nenhum exame enviado." />}
        <a href="/upload" className="block mt-3 text-center py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium">Enviar exame</a>
      </section>

      <section className="bg-white rounded-2xl border p-4">
        <div className="flex items-center gap-2 mb-3">
          <QrCode className="w-5 h-5 text-emerald-600" />
          <h2 className="font-bold">Compartilhamento médico</h2>
        </div>
        <p className="text-xs text-gray-500 mb-3">O código pode levar junto o vínculo CNS/Cartão SUS informado, quando cadastrado.</p>
        <button onClick={generateEmergencyCode} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-medium">Gerar código de acesso</button>
        {shareCode && (
          <div className="mt-4 text-center bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <p className="text-sm text-emerald-700">Código:</p>
            <p className="text-3xl font-bold tracking-widest text-emerald-900">{shareCode}</p>
            <button onClick={copyCode} className="mt-3 w-full bg-white border border-emerald-300 text-emerald-700 py-2 rounded-xl font-medium flex items-center justify-center gap-2">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copiado!' : 'Copiar código'}
            </button>
          </div>
        )}
      </section>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-700" />
        <p className="text-xs text-yellow-800">Em emergência real, ligue para o serviço de emergência local. Este passaporte é apoio informativo e não substitui avaliação médica.</p>
      </div>
    </div>
  )
}

function UsersIconSafe(props: any) {
  return <Stethoscope {...props} />
}

function EmergencyMiniCard({ icon: Icon, label, value }: any) {
  return (
    <div className="bg-white/15 rounded-xl p-3">
      <Icon className="w-4 h-4 text-white/90 mb-1" />
      <p className="text-[11px] text-white/70">{label}</p>
      <p className="text-sm font-semibold line-clamp-2">{value}</p>
    </div>
  )
}

function InfoCard({ icon: Icon, label, value }: any) {
  return (
    <div className="rounded-xl border bg-gray-50 p-3">
      <Icon className="w-5 h-5 text-emerald-600 mb-2" />
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold line-clamp-2">{value || 'Não informado'}</p>
    </div>
  )
}

function Empty({ text }: any) {
  return <p className="text-sm text-gray-500">{text}</p>
}

function formatMedsShort(meds: any[]) {
  if (!meds.length) return 'Não informado'
  return meds.slice(0, 3).map((med) => `${med.name || med.medication_name || 'Medicamento'} ${med.dosage || ''}`.trim()).join(', ')
}

function formatDate(date: string) {
  if (!date) return 'Não informado'
  return new Date(date).toLocaleDateString('pt-BR')
}
