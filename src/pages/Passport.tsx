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
  Siren,
  HeartPulse,
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

    const [medsRes, conditionsRes, plansRes] = await Promise.all([
      supabase.from('medications').select('*').eq('user_id', user.id),
      supabase.from('patient_conditions').select('*').eq('user_id', user.id),
      supabase.from('health_plans').select('*').eq('user_id', user.id),
    ])

    setMedications(medsRes.data || [])
    setConditions(conditionsRes.data || [])
    setPlans(plansRes.data || [])
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

  return (
    <div className="p-4 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 text-white p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Health Passport</h1>
            <p className="text-white/80 text-sm">Perfil rápido de emergência</p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <p><strong>Nome:</strong> {profile.fullName || user?.email || 'Não informado'}</p>
          <p><strong>Tipo sanguíneo:</strong> {profile.bloodType || 'Não informado'}</p>
          <p><strong>Peso:</strong> {profile.weight ? `${profile.weight} kg` : 'Não informado'}</p>
          <p><strong>Altura:</strong> {profile.height ? `${profile.height} cm` : 'Não informado'}</p>
          <p><strong>Telefone:</strong> {profile.phone || 'Não informado'}</p>
          <p><strong>MedScore:</strong> {profile.medScore ? `${profile.medScore}/100` : 'Não calculado'}</p>
        </div>
      </div>

      <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Siren className="w-5 h-5 text-red-600" />
          <h2 className="font-bold text-red-700">Contato de Emergência</h2>
        </div>

        {profile.emergencyContactName ? (
          <div className="space-y-1 text-sm">
            <p><strong>Nome:</strong> {profile.emergencyContactName}</p>
            <p><strong>Telefone:</strong> {profile.emergencyContactPhone || 'Não informado'}</p>
            <p><strong>Parentesco:</strong> {profile.emergencyContactRelationship || 'Não informado'}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Nenhum contato cadastrado.</p>
        )}
      </div>

      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <HeartPulse className="w-5 h-5 text-blue-600" />
          <h2 className="font-bold text-blue-700">Resumo de Emergência</h2>
        </div>

        <ul className="space-y-2 text-sm">
          <li><strong>Tipo sanguíneo:</strong> {profile.bloodType || 'Não informado'}</li>
          <li><strong>Alergias:</strong> {allergies.length > 0 ? allergies.join(', ') : 'Nenhuma informada'}</li>
          <li><strong>Condições:</strong> {profile.chronicConditions || 'Nenhuma informada'}</li>
          <li><strong>Medicamentos:</strong> {profile.currentMedications || 'Nenhum informado'}</li>
          <li><strong>Cirurgias:</strong> {profile.surgeries || 'Nenhuma informada'}</li>
        </ul>
      </div>

      <div className="mt-4 bg-white rounded-xl border p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <h2 className="font-bold">Alergias</h2>
        </div>

        {allergies.length > 0 ? (
          allergies.map((item: string, index: number) => (
            <p key={index} className="text-sm border-b py-2">
              {item}
            </p>
          ))
        ) : (
          <p className="text-sm text-gray-500">Nenhuma alergia cadastrada.</p>
        )}
      </div>

      <div className="mt-4 bg-white rounded-xl border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Pill className="w-5 h-5 text-orange-600" />
          <h2 className="font-bold">Medicamentos</h2>
        </div>

        {medications.length > 0 ? (
          medications.map((med) => (
            <p key={med.id} className="text-sm border-b py-2">
              {med.name || med.medication_name || 'Medicamento'} {med.dosage || ''}
            </p>
          ))
        ) : profile.currentMedications ? (
          <p className="text-sm text-gray-700">{profile.currentMedications}</p>
        ) : (
          <p className="text-sm text-gray-500">Nenhum medicamento cadastrado.</p>
        )}
      </div>

      <div className="mt-4 bg-white rounded-xl border p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600" />
          <h2 className="font-bold">Condições / Alertas</h2>
        </div>

        {conditions.length > 0 ? (
          conditions.map((item) => (
            <p key={item.id} className="text-sm border-b py-2">
              {item.name || item.condition || item.title || 'Condição'}
            </p>
          ))
        ) : profile.chronicConditions ? (
          <p className="text-sm text-gray-700">{profile.chronicConditions}</p>
        ) : (
          <p className="text-sm text-gray-500">Nenhuma condição cadastrada.</p>
        )}
      </div>

      <div className="mt-4 bg-white rounded-xl border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-5 h-5 text-indigo-600" />
          <h2 className="font-bold">Cirurgias e Internações</h2>
        </div>

        {profile.surgeries ? (
          <p className="text-sm text-gray-700">{profile.surgeries}</p>
        ) : (
          <p className="text-sm text-gray-500">Nenhuma cirurgia cadastrada.</p>
        )}
      </div>

      <div className="mt-4 bg-white rounded-xl border p-4">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="w-5 h-5 text-blue-600" />
          <h2 className="font-bold">Carteirinhas / Plano</h2>
        </div>

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
          <p className="text-sm text-gray-500">Nenhuma carteirinha cadastrada.</p>
        )}
      </div>

      <div className="mt-4 bg-white rounded-xl border p-4">
        <div className="flex items-center gap-2 mb-3">
          <QrCode className="w-5 h-5 text-emerald-600" />
          <h2 className="font-bold">Compartilhamento de emergência</h2>
        </div>

        <button
          onClick={generateEmergencyCode}
          className="w-full bg-emerald-600 text-white py-3 rounded-xl font-medium"
        >
          Gerar código de emergência
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

            <p className="text-xs text-emerald-700 mt-2">
              O profissional acessa pelo MyDataMed usando este código.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex gap-3">
        <Phone className="w-5 h-5 text-yellow-700" />
        <p className="text-xs text-yellow-800">
          Em emergência real, ligue para o serviço de emergência local. Este passaporte é apenas um apoio informativo.
        </p>
      </div>
    </div>
  )
}
