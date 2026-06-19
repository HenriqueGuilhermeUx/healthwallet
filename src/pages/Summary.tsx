import { useEffect, useState } from 'react'
import {
  FileText,
  Share2,
  Copy,
  RefreshCw,
  User,
  HeartPulse,
  Pill,
  AlertTriangle,
  ClipboardList,
  Activity,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { createProfessionalShare } from '@/services/shareAccess'
import { useAuth } from '@/hooks/useAuth'
import { generateHealthSummary } from '@/services/generateHealthSummary'

export default function Summary() {
  const { user } = useAuth()
  const [summary, setSummary] = useState('')
  const [shareCode, setShareCode] = useState('')
  const [loading, setLoading] = useState(false)

  const [profile, setProfile] = useState<any>({})
  const [records, setRecords] = useState<any[]>([])
  const [medications, setMedications] = useState<any[]>([])
  const [conditions, setConditions] = useState<any[]>([])
  const [score, setScore] = useState<any>(null)

  useEffect(() => {
    load()
  }, [user])

  async function load() {
    if (!user) return

    const [summaryRes, profileRes, recordsRes, medsRes, conditionsRes, scoreRes] =
      await Promise.all([
        supabase.from('health_summaries').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('medical_records').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('medications').select('*').eq('user_id', user.id),
        supabase.from('patient_conditions').select('*').eq('user_id', user.id),
        supabase
          .from('health_scores')
          .select('*')
          .eq('user_id', user.id)
          .order('calculated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

    setProfile(profileRes.data || {})
    setRecords(recordsRes.data || [])
    setMedications(medsRes.data || [])
    setConditions(conditionsRes.data || [])
    setScore(scoreRes.data || null)

    if (summaryRes.data?.summary) {
      setSummary(summaryRes.data.summary)
    } else {
      await generateAndSave()
    }
  }

  async function generateAndSave() {
    if (!user) return

    setLoading(true)

    try {
      const [profileRes, recordsRes, medsRes, conditionsRes, scoreRes] =
        await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          supabase.from('medical_records').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('medications').select('*').eq('user_id', user.id),
          supabase.from('patient_conditions').select('*').eq('user_id', user.id),
          supabase
            .from('health_scores')
            .select('*')
            .eq('user_id', user.id)
            .order('calculated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])

      const profileData = profileRes.data || {}
      const recordsData = recordsRes.data || []
      const medsData = medsRes.data || []
      const conditionsData = conditionsRes.data || []
      const scoreData = scoreRes.data || null

      const text = generateHealthSummary(
        profileData,
        recordsData,
        medsData,
        conditionsData,
        scoreData
      )

      await supabase.from('health_summaries').upsert(
        {
          user_id: user.id,
          summary: text,
          professional_summary: text,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

      setProfile(profileData)
      setRecords(recordsData)
      setMedications(medsData)
      setConditions(conditionsData)
      setScore(scoreData)
      setSummary(text)
    } catch (error) {
      console.error('Erro ao gerar resumo:', error)
      alert('Erro ao gerar resumo')
    } finally {
      setLoading(false)
    }
  }

  async function handleShare() {
    if (!user) return

    const share = await createProfessionalShare(user.id)
    setShareCode(share.access_code)
  }

  async function copyCode() {
    if (!shareCode) return
    await navigator.clipboard.writeText(shareCode)
    alert('Código copiado!')
  }

  const alteredItems = records.flatMap((record) => {
    const items = record.ai_result?.items || []

    return items
      .filter((item: any) => item.status && item.status !== 'normal')
      .map((item: any) => ({
        name: item.name,
        value: item.value,
        status: item.status,
        reference: item.reference || item.referenceRange || '',
      }))
  })

  const allergies = Array.isArray(profile.allergies)
    ? profile.allergies.join(', ')
    : profile.allergies || 'Não informado'

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-5">
        <div className="flex items-center gap-3">
          <FileText className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Resumo Profissional</h1>
            <p className="text-white/80 text-sm">
              Visão organizada para consulta médica ou profissional de saúde.
            </p>
          </div>
        </div>
      </div>

      <Section icon={User} title="Paciente">
        <Info label="Idade" value={profile.birth_date ? `${calculateAge(profile.birth_date)} anos` : 'Não informado'} />
        <Info label="Sexo" value={translateGender(profile.gender)} />
        <Info label="Tipo sanguíneo" value={profile.blood_type} />
        <Info label="Peso" value={profile.weight ? `${profile.weight} kg` : ''} />
        <Info label="Altura" value={profile.height ? `${profile.height} cm` : ''} />
      </Section>

      <Section icon={Activity} title="MedScore">
        <Info label="Score atual" value={score?.score ? `${score.score}/100` : 'Não calculado'} />
        <Info label="Nível" value={score?.status || 'Não informado'} />
        <Info label="Confiança dos dados" value={score?.factors?.confidence ? `${score.factors.confidence}%` : 'Não informado'} />
      </Section>

      <Section icon={HeartPulse} title="Histórico Clínico">
        <Info label="Condições" value={conditions.length ? conditions.map((c) => c.name || c.condition || c.title).join(', ') : profile.chronic_conditions} />
        <Info label="Alergias" value={allergies} />
        <Info label="Histórico familiar" value={profile.family_history} />
        <Info label="Cirurgias / internações" value={profile.surgeries} />
      </Section>

      <Section icon={Pill} title="Medicamentos">
        {medications.length > 0 ? (
          medications.map((med) => (
            <p key={med.id} className="text-sm border-b py-2">
              {med.name || med.medication_name || 'Medicamento'} {med.dosage || ''} {med.frequency || ''}
            </p>
          ))
        ) : profile.current_medications ? (
          <p className="text-sm text-gray-700">{profile.current_medications}</p>
        ) : (
          <Empty text="Nenhum medicamento informado." />
        )}
      </Section>

      <Section icon={AlertTriangle} title="Exames alterados">
        {alteredItems.length > 0 ? (
          alteredItems.map((item, idx) => (
            <div key={idx} className="border-b py-2 text-sm">
              <p className="font-medium">{item.name}</p>
              <p className="text-gray-600">
                Valor: {item.value} · Status: {translateStatus(item.status)}
              </p>
              {item.reference && (
                <p className="text-xs text-gray-500">Referência: {item.reference}</p>
              )}
            </div>
          ))
        ) : (
          <Empty text="Nenhum marcador alterado identificado nos exames analisados." />
        )}
      </Section>

      <Section icon={ClipboardList} title="Resumo completo">
        <pre className="whitespace-pre-wrap text-sm text-gray-700">
          {loading ? 'Gerando resumo...' : summary || 'Nenhum resumo disponível'}
        </pre>
      </Section>

      <div className="bg-white rounded-xl border p-4 space-y-3">
        <button
          onClick={generateAndSave}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar Resumo
        </button>

        <button
          onClick={handleShare}
          className="w-full bg-emerald-600 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2"
        >
          <Share2 className="w-4 h-4" />
          Compartilhar com Profissional
        </button>

        {shareCode && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="text-sm text-emerald-700 mb-1">Código gerado:</p>

            <p className="text-3xl font-bold tracking-widest text-emerald-900">
              {shareCode}
            </p>

            <button
              onClick={copyCode}
              className="mt-3 w-full bg-white border border-emerald-300 text-emerald-700 py-2 rounded-xl font-medium flex items-center justify-center gap-2"
            >
              <Copy className="w-4 h-4" />
              Copiar código
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, children }: any) {
  return (
    <section className="bg-white rounded-xl border p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5 text-blue-600" />
        <h2 className="font-bold">{title}</h2>
      </div>
      {children}
    </section>
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

function calculateAge(birthDate: string) {
  const birth = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function translateGender(value: string) {
  if (value === 'male') return 'Masculino'
  if (value === 'female') return 'Feminino'
  if (value === 'other') return 'Outro'
  return value || 'Não informado'
}

function translateStatus(value: string) {
  const map: Record<string, string> = {
    alto: 'Acima do recomendado',
    high: 'Acima do recomendado',
    baixo: 'Abaixo do recomendado',
    low: 'Abaixo do recomendado',
    atencao: 'Atenção',
    critical: 'Crítico',
  }

  return map[value] || value || 'Não informado'
}
