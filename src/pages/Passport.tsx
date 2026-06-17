import { useEffect, useState } from 'react'
import { Shield, Pill, AlertTriangle, Phone, QrCode } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { createProfessionalShare } from '@/services/shareAccess'

export default function Passport() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<any>({})
  const [medications, setMedications] = useState<any[]>([])
  const [conditions, setConditions] = useState<any[]>([])
  const [shareCode, setShareCode] = useState('')

  useEffect(() => {
    load()
  }, [user])

  async function load() {
    if (!user) return

    const profileRaw = localStorage.getItem(`healthwallet_profile_${user.id}`)
    setProfile(profileRaw ? JSON.parse(profileRaw) : {})

    const [medsRes, conditionsRes] = await Promise.all([
      supabase.from('medications').select('*').eq('user_id', user.id),
      supabase.from('patient_conditions').select('*').eq('user_id', user.id),
    ])

    setMedications(medsRes.data || [])
    setConditions(conditionsRes.data || [])
  }

  async function generateEmergencyCode() {
    if (!user) return
    const share = await createProfessionalShare(user.id)
    setShareCode(share.access_code)
  }

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
          <p><strong>Nome:</strong> {profile.fullName || profile.name || user?.email || 'Não informado'}</p>
          <p><strong>Tipo sanguíneo:</strong> {profile.bloodType || 'Não informado'}</p>
          <p><strong>Peso:</strong> {profile.weight || 'Não informado'}</p>
          <p><strong>Altura:</strong> {profile.height || 'Não informado'}</p>
          <p><strong>Contato emergência:</strong> {profile.emergencyPhone || profile.emergencyContact || 'Não informado'}</p>
        </div>
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
        ) : (
          <p className="text-sm text-gray-500">Nenhum medicamento cadastrado.</p>
        )}
      </div>

      <div className="mt-4 bg-white rounded-xl border p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <h2 className="font-bold">Condições / Alertas</h2>
        </div>

        {conditions.length > 0 ? (
          conditions.map((item) => (
            <p key={item.id} className="text-sm border-b py-2">
              {item.name || item.condition || item.title || 'Condição'}
            </p>
          ))
        ) : (
          <p className="text-sm text-gray-500">Nenhuma condição cadastrada.</p>
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
            <p className="text-xs text-emerald-700 mt-2">
              Profissional acessa pelo MyDataMed.
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
