import { FormEvent, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  Brain,
  CheckCircle,
  CreditCard,
  FileText,
  Loader2,
  LockKeyhole,
  Pill,
  Shield,
  Stethoscope,
  User,
  Users,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

interface RedeemedGrant {
  access_code_id: string
  patient_id: string
  permissions: Record<string, boolean>
  expires_at: string
  professional_id: string
}

export default function AccessCode() {
  const { code } = useParams()
  const { user, loading: authLoading, signInWithEmail } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [grant, setGrant] = useState<RedeemedGrant | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [summary, setSummary] = useState<any>(null)
  const [score, setScore] = useState<any>(null)
  const [exams, setExams] = useState<any[]>([])
  const [medications, setMedications] = useState<any[]>([])
  const [healthPlans, setHealthPlans] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])

  useEffect(() => {
    if (!code) {
      setError('Código não informado.')
      setLoading(false)
      return
    }

    if (authLoading) return

    if (!user) {
      setLoading(false)
      setGrant(null)
      return
    }

    void redeemAndLoad()
  }, [code, user?.id, authLoading])

  async function handleProfessionalLogin(event: FormEvent) {
    event.preventDefault()
    setSigningIn(true)
    setError('')

    try {
      const { error } = await signInWithEmail(email.trim(), password)
      if (error) setError(error.message || 'Não foi possível entrar.')
    } catch (loginError) {
      console.error(loginError)
      setError('Não foi possível entrar com a conta profissional.')
    } finally {
      setSigningIn(false)
    }
  }

  async function redeemAndLoad() {
    if (!code || !user) return
    setLoading(true)
    setError('')
    clearClinicalState()

    try {
      const { data, error: redeemError } = await supabase.rpc('redeem_health_access_code', {
        p_code: code,
      })

      if (redeemError) throw redeemError

      const row = (Array.isArray(data) ? data[0] : data) as RedeemedGrant | null
      if (!row?.patient_id || !row?.access_code_id) throw new Error('invalid_secure_share_response')

      setGrant(row)
      await loadAuthorizedContext(row)
    } catch (redeemError: any) {
      console.error(redeemError)
      setGrant(null)
      setError(mapRedeemError(redeemError?.message || ''))
    } finally {
      setLoading(false)
    }
  }

  function clearClinicalState() {
    setProfile(null)
    setSummary(null)
    setScore(null)
    setExams([])
    setMedications([])
    setHealthPlans([])
    setRecords([])
  }

  async function loadAuthorizedContext(current: RedeemedGrant) {
    const allowed = current.permissions || {}
    const patientId = current.patient_id

    const shouldLoadProfile =
      allowed.profile ||
      allowed.passport ||
      allowed.allergies ||
      allowed.emergency_contact ||
      allowed.family_history

    const tasks: Promise<void>[] = []

    if (shouldLoadProfile) {
      tasks.push(
        supabase
          .from('profiles')
          .select('*')
          .eq('id', patientId)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) throw error
            setProfile(data || null)
          }),
      )
    }

    if (allowed.summary) {
      tasks.push(
        supabase
          .from('health_summaries')
          .select('*')
          .eq('user_id', patientId)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) throw error
            setSummary(data || null)
          }),
      )
    }

    if (allowed.medscore) {
      tasks.push(
        supabase
          .from('health_scores')
          .select('*')
          .eq('user_id', patientId)
          .order('calculated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) throw error
            setScore(data || null)
          }),
      )
    }

    if (allowed.exams || allowed.ai_analysis) {
      tasks.push(
        supabase
          .from('medical_records')
          .select('*')
          .eq('user_id', patientId)
          .order('created_at', { ascending: false })
          .limit(20)
          .then(({ data, error }) => {
            if (error) throw error
            setExams(data || [])
          }),
      )
    }

    if (allowed.medications) {
      tasks.push(
        supabase
          .from('medications')
          .select('*')
          .eq('user_id', patientId)
          .order('created_at', { ascending: false })
          .limit(20)
          .then(({ data, error }) => {
            if (error) throw error
            setMedications(data || [])
          }),
      )
    }

    if (allowed.health_plan) {
      tasks.push(
        supabase
          .from('health_plans')
          .select('*')
          .eq('user_id', patientId)
          .order('created_at', { ascending: false })
          .limit(20)
          .then(({ data, error }) => {
            if (error) throw error
            setHealthPlans(data || [])
          }),
      )
    }

    if (allowed.passport) {
      tasks.push(
        supabase
          .from('medical_events')
          .select('*')
          .eq('user_id', patientId)
          .order('event_date', { ascending: false })
          .limit(10)
          .then(({ data, error }) => {
            if (error) throw error
            setRecords(data || [])
          }),
      )
    }

    const results = await Promise.allSettled(tasks)
    const failed = results.filter((item) => item.status === 'rejected')
    if (failed.length > 0) {
      console.warn('Some authorized health-share sections could not be loaded', failed)
    }
  }

  if (authLoading || loading) {
    return <CenteredCard><Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-emerald-600" /><p className="font-semibold">Validando acesso seguro...</p></CenteredCard>
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-md rounded-3xl border bg-white p-6 shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100">
            <LockKeyhole className="h-7 w-7 text-emerald-700" />
          </div>
          <h1 className="text-center text-xl font-bold">Acesso profissional protegido</h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            O link não abre dados de saúde anonimamente. Entre com sua conta profissional para resgatar a autorização do paciente.
          </p>

          {error && <ErrorBox text={error} />}

          <form onSubmit={handleProfessionalLogin} className="mt-6 space-y-3">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="E-mail profissional"
              className="w-full rounded-xl border px-4 py-3 outline-none focus:border-emerald-500"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Senha"
              className="w-full rounded-xl border px-4 py-3 outline-none focus:border-emerald-500"
              required
            />
            <button
              type="submit"
              disabled={signingIn}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-50"
            >
              {signingIn && <Loader2 className="h-4 w-4 animate-spin" />}
              {signingIn ? 'Entrando...' : 'Entrar e validar autorização'}
            </button>
          </form>

          <p className="mt-4 text-xs text-gray-500">
            Apenas profissionais com perfil profissional cadastrado podem resgatar este token. O primeiro resgate vincula o token àquela conta até a expiração ou revogação pelo paciente.
          </p>
        </div>
      </div>
    )
  }

  if (error || !grant) {
    return (
      <CenteredCard>
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-600" />
        <h1 className="text-xl font-bold">Acesso indisponível</h1>
        <p className="mt-2 text-sm text-gray-600">{error || 'A autorização não pôde ser validada.'}</p>
      </CenteredCard>
    )
  }

  const allowed = grant.permissions || {}
  const patientName = profile?.full_name || profile?.name || profile?.nome || 'Paciente HealthWallet'

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600"><Shield className="h-5 w-5 text-white" /></div>
          <div>
            <h1 className="font-bold">HealthWallet</h1>
            <p className="text-xs text-gray-500">Acesso profissional autorizado e vinculado</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <p className="font-semibold text-emerald-900">Autorização validada</p>
            <p className="text-sm text-emerald-800">Você só consegue consultar as categorias escolhidas pelo paciente até {formatDate(grant.expires_at)}.</p>
          </div>
        </div>

        {allowed.profile && <Section icon={User} title="Perfil do paciente"><InfoGrid values={[
          ['Nome', patientName],
          ['Nascimento', profile?.birth_date],
          ['Sexo', profile?.gender],
          ['Tipo sanguíneo', profile?.blood_type],
        ]} /></Section>}

        {allowed.summary && <Section icon={FileText} title="Resumo profissional">{summary ? <p className="whitespace-pre-wrap text-sm text-gray-700">{summary.professional_summary || summary.summary || 'Resumo cadastrado sem texto estruturado.'}</p> : <Empty />}</Section>}

        {allowed.medscore && <Section icon={Activity} title="MedScore">{score ? <div className="rounded-xl bg-emerald-50 p-4"><p className="text-sm text-emerald-700">Score atual</p><p className="text-4xl font-bold text-emerald-900">{score.score ?? '-'}<span className="text-lg">/100</span></p><p className="text-sm text-emerald-700">{score.status || ''}</p></div> : <Empty />}</Section>}

        {allowed.exams && <Section icon={FileText} title="Exames"><ListCards items={exams} title={(item) => item.file_name || item.title || item.exam_type || 'Exame'} detail={(item) => formatDate(item.created_at || item.exam_date || item.date)} /></Section>}

        {allowed.ai_analysis && <Section icon={Brain} title="Análises por IA"><ListCards items={exams.filter((item) => item.ai_result)} title={(item) => item.file_name || item.exam_type || 'Exame analisado'} detail={(item) => item.ai_result?.summary || item.ai_result?.clinicalSummary || 'Análise disponível'} /></Section>}

        {allowed.medications && <Section icon={Pill} title="Medicamentos"><ListCards items={medications} title={(item) => item.name || item.medication_name || 'Medicamento'} detail={(item) => [item.dosage, item.frequency].filter(Boolean).join(' · ')} /></Section>}

        {allowed.passport && <Section icon={Stethoscope} title="Passport / eventos clínicos"><ListCards items={records} title={(item) => item.title || 'Evento clínico'} detail={(item) => formatDate(item.event_date)} /></Section>}

        {allowed.health_plan && <Section icon={CreditCard} title="Plano / SUS"><ListCards items={healthPlans} title={(item) => item.plan_name || item.name || item.provider || 'Carteira'} detail={(item) => item.card_number || item.sus_number || item.number || 'Número não informado'} /></Section>}

        {allowed.allergies && <Section icon={AlertCircle} title="Alergias"><p className="text-sm text-gray-700">{formatArrayOrText(profile?.allergies) || 'Nenhuma alergia informada.'}</p></Section>}

        {allowed.emergency_contact && <Section icon={Shield} title="Contato de emergência"><InfoGrid values={[
          ['Nome', profile?.emergency_contact_name],
          ['Telefone', profile?.emergency_contact_phone],
          ['Parentesco', profile?.emergency_contact_relationship],
        ]} /></Section>}

        {allowed.family_history && <Section icon={Users} title="Histórico familiar"><p className="text-sm text-gray-700">{profile?.family_history || 'Histórico familiar não informado.'}</p></Section>}

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800">
          Este acesso é temporário, auditável, vinculado à sua conta profissional e pode ser revogado pelo paciente a qualquer momento.
        </div>
      </main>
    </div>
  )
}

function mapRedeemError(message: string) {
  if (message.includes('professional_profile_required')) return 'Sua conta está autenticada, mas não possui um perfil profissional habilitado no MyDataMed.'
  if (message.includes('legacy_access_code_not_supported')) return 'Este é um código legado. Peça ao paciente para gerar um novo compartilhamento seguro.'
  if (message.includes('access_code_already_redeemed')) return 'Este token já foi vinculado a outro profissional.'
  if (message.includes('access_code_expired')) return 'Este acesso expirou. Peça ao paciente para gerar um novo token.'
  if (message.includes('access_code_revoked')) return 'O paciente revogou este acesso.'
  if (message.includes('invalid_access_code')) return 'Token inválido ou inexistente.'
  return 'Não foi possível validar o acesso profissional.'
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 px-4 py-12"><div className="mx-auto max-w-md rounded-3xl border bg-white p-6 text-center shadow-sm">{children}</div></div>
}

function ErrorBox({ text }: { text: string }) {
  return <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{text}</div>
}

function Section({ icon: Icon, title, children }: any) {
  return <section className="rounded-2xl border bg-white p-4"><div className="mb-3 flex items-center gap-2"><Icon className="h-5 w-5 text-emerald-600" /><h2 className="font-bold">{title}</h2></div>{children}</section>
}

function InfoGrid({ values }: { values: Array<[string, any]> }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{values.map(([label, value]) => <div key={label} className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">{label}</p><p className="break-words text-sm font-semibold">{value || 'Não informado'}</p></div>)}</div>
}

function ListCards({ items, title, detail }: { items: any[]; title: (item: any) => string; detail: (item: any) => string }) {
  if (!items.length) return <Empty />
  return <div className="space-y-2">{items.map((item, index) => <div key={item.id || index} className="rounded-xl bg-gray-50 p-3"><p className="font-semibold">{title(item)}</p><p className="mt-1 text-xs text-gray-500">{detail(item) || 'Sem detalhes adicionais'}</p></div>)}</div>
}

function Empty() {
  return <p className="text-sm text-gray-500">Nenhum dado autorizado foi encontrado nesta categoria.</p>
}

function formatDate(value?: string) {
  if (!value) return 'Não informado'
  return new Date(value).toLocaleString('pt-BR')
}

function formatArrayOrText(value: any) {
  if (Array.isArray(value)) return value.join(', ')
  return value || ''
}
