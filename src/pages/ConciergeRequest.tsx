import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  FileSearch,
  HeartPulse,
  HelpCircle,
  Loader2,
  MessageCircle,
  Navigation,
  Pill,
  Send,
  Stethoscope,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { createConciergeRequest, type ConciergeRequestCategory } from '@/services/concierge'

const categories: Array<{
  key: ConciergeRequestCategory
  title: string
  subtitle: string
  icon: any
}> = [
  { key: 'symptom', title: 'Estou com um sintoma', subtitle: 'Conte o que está sentindo e há quanto tempo.', icon: HeartPulse },
  { key: 'guidance', title: 'Quero orientação', subtitle: 'Dúvidas sobre sua jornada de saúde.', icon: MessageCircle },
  { key: 'exam_review', title: 'Quero entender exames', subtitle: 'Organize sua dúvida para a equipe revisar.', icon: FileSearch },
  { key: 'second_analysis', title: 'Quero segunda análise', subtitle: 'Revisão coordenada de exames, laudos e histórico.', icon: Stethoscope },
  { key: 'medication_review', title: 'Quero revisar medicamentos', subtitle: 'Dúvidas de uso, organização ou conciliação.', icon: Pill },
  { key: 'navigation', title: 'Preciso navegar o sistema de saúde', subtitle: 'Ajuda com especialidade, exame, autorização ou próximo passo.', icon: Navigation },
  { key: 'other', title: 'Outro assunto', subtitle: 'Explique sua necessidade para a equipe.', icon: HelpCircle },
]

const titles: Record<ConciergeRequestCategory, string> = {
  symptom: 'Novo sintoma',
  guidance: 'Pedido de orientação',
  exam_review: 'Revisão de exames',
  second_analysis: 'Segunda análise',
  medication_review: 'Revisão de medicamentos',
  navigation: 'Navegação em saúde',
  other: 'Solicitação Concierge',
}

function validCategory(value: string | null): ConciergeRequestCategory | null {
  return categories.some((item) => item.key === value) ? value as ConciergeRequestCategory : null
}

export default function ConciergeRequest() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [category, setCategory] = useState<ConciergeRequestCategory | null>(() => validCategory(searchParams.get('category')))
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState('')
  const [intensity, setIntensity] = useState('')
  const [fever, setFever] = useState('unknown')
  const [pain, setPain] = useState('unknown')
  const [redFlag, setRedFlag] = useState(false)
  const [forFamily, setForFamily] = useState(false)
  const [subjectName, setSubjectName] = useState('')
  const [subjectRelationship, setSubjectRelationship] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const selected = useMemo(() => categories.find((item) => item.key === category), [category])

  async function buildContextSnapshot() {
    if (!user) return {}

    const [scoreRes, connectionRes] = await Promise.all([
      supabase
        .from('health_scores')
        .select('score,status,calculated_at,factors')
        .eq('user_id', user.id)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('health_device_connections')
        .select('provider,status,last_synced_at')
        .eq('user_id', user.id)
        .eq('status', 'connected')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    return {
      medscore: scoreRes.data
        ? {
            score: scoreRes.data.score,
            status: scoreRes.data.status,
            calculated_at: scoreRes.data.calculated_at,
          }
        : null,
      device_connection: connectionRes.data || null,
      captured_at: new Date().toISOString(),
    }
  }

  async function submit() {
    if (!user || !category) return
    if (description.trim().length < 10) {
      toast.error('Conte um pouco mais para a equipe conseguir entender sua necessidade.')
      return
    }
    if (forFamily && subjectName.trim().length < 2) {
      toast.error('Informe o nome da pessoa da família.')
      return
    }

    setSubmitting(true)
    try {
      const contextSnapshot = await buildContextSnapshot()
      const request = await createConciergeRequest({
        patientId: user.id,
        category,
        title: titles[category],
        description: description.trim(),
        subjectName: forFamily ? subjectName.trim() : undefined,
        subjectRelationship: forFamily ? subjectRelationship.trim() : undefined,
        symptomPayload: category === 'symptom'
          ? { duration, intensity, fever, pain, red_flag_reported: redFlag }
          : {},
        contextSnapshot,
        urgency: redFlag ? 'urgent_redirect' : intensity === 'severe' ? 'priority' : 'routine',
      })

      toast.success('Solicitação enviada para sua equipe')
      navigate(`/concierge/requests/${request.id}`)
    } catch (error: any) {
      console.error('Concierge request failed:', error)
      toast.error(error?.message?.includes('concierge_requests')
        ? 'O módulo Concierge ainda precisa ser ativado no banco de dados.'
        : 'Não foi possível enviar agora. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!category) {
    return (
      <div className="space-y-5 pb-28">
        <section className="rounded-3xl bg-gradient-to-br from-emerald-700 to-teal-800 p-5 text-white">
          <button type="button" onClick={() => navigate('/concierge')} className="mb-4 flex items-center gap-2 text-sm text-white/80">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <p className="text-xs uppercase tracking-wider text-white/70">HealthWallet Concierge</p>
          <h1 className="mt-2 text-2xl font-bold">Como podemos ajudar?</h1>
          <p className="mt-2 text-sm text-white/80">Sua solicitação vira um caso acompanhado pela equipe, com histórico e próximos passos.</p>
        </section>

        <div className="space-y-3">
          {categories.map(({ key, title, subtitle, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              className="w-full rounded-2xl border bg-white p-4 text-left flex items-center gap-3"
            >
              <div className="h-11 w-11 flex-shrink-0 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <p>Concierge não é serviço de emergência. Em situação grave ou risco imediato, procure o serviço de urgência da sua região.</p>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl border bg-white p-5">
        <button type="button" onClick={() => setCategory(null)} className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Trocar categoria
        </button>
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{selected?.title}</p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Conte para sua equipe</h1>
        <p className="mt-2 text-sm text-muted-foreground">Não precisa escrever em termos médicos. Explique com suas palavras.</p>
      </section>

      <section className="rounded-2xl border bg-white p-4 space-y-4">
        <div>
          <label className="text-sm font-semibold text-gray-900">Esta solicitação é para</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setForFamily(false)} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${!forFamily ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'bg-white'}`}>Mim</button>
            <button type="button" onClick={() => setForFamily(true)} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${forFamily ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'bg-white'}`}>Minha família</button>
          </div>
        </div>

        {forFamily && (
          <div className="grid gap-3">
            <input value={subjectName} onChange={(event) => setSubjectName(event.target.value)} placeholder="Nome da pessoa" className="w-full rounded-xl border px-3 py-3 text-sm" />
            <input value={subjectRelationship} onChange={(event) => setSubjectRelationship(event.target.value)} placeholder="Relação: mãe, filho, esposa..." className="w-full rounded-xl border px-3 py-3 text-sm" />
          </div>
        )}

        <div>
          <label className="text-sm font-semibold text-gray-900">O que está acontecendo?</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={6}
            placeholder={category === 'symptom' ? 'Ex.: estou com dor de garganta desde ontem, piora para engolir...' : category === 'second_analysis' ? 'Explique o que já foi avaliado, qual dúvida ainda ficou aberta e o que você gostaria que a equipe revisasse.' : category === 'navigation' ? 'Ex.: preciso fazer uma ressonância; quero saber como me organizar, qual especialidade procurar depois e o que levar.' : 'Explique sua dúvida, contexto e o que você gostaria de entender.'}
            className="mt-2 w-full resize-none rounded-xl border px-3 py-3 text-sm"
          />
        </div>

        {category === 'symptom' && (
          <div className="space-y-4 border-t pt-4">
            <div>
              <label className="text-sm font-semibold">Há quanto tempo?</label>
              <input value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="Ex.: 2 dias, 1 semana" className="mt-2 w-full rounded-xl border px-3 py-3 text-sm" />
            </div>

            <div>
              <label className="text-sm font-semibold">Intensidade</label>
              <select value={intensity} onChange={(event) => setIntensity(event.target.value)} className="mt-2 w-full rounded-xl border bg-white px-3 py-3 text-sm">
                <option value="">Selecione</option>
                <option value="mild">Leve</option>
                <option value="moderate">Moderada</option>
                <option value="severe">Forte</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Dor
                <select value={pain} onChange={(event) => setPain(event.target.value)} className="mt-2 w-full rounded-xl border bg-white px-3 py-3 text-sm">
                  <option value="unknown">Não sei</option><option value="yes">Sim</option><option value="no">Não</option>
                </select>
              </label>
              <label className="text-sm">Febre
                <select value={fever} onChange={(event) => setFever(event.target.value)} className="mt-2 w-full rounded-xl border bg-white px-3 py-3 text-sm">
                  <option value="unknown">Não sei</option><option value="yes">Sim</option><option value="no">Não</option>
                </select>
              </label>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <input type="checkbox" checked={redFlag} onChange={(event) => setRedFlag(event.target.checked)} className="mt-1" />
              <span>Há falta de ar intensa, dor forte no peito, desmaio, confusão importante, sangramento intenso ou outra situação que parece grave.</span>
            </label>

            {redFlag && (
              <div className="rounded-xl bg-red-100 p-4 text-sm font-medium text-red-900">
                Não espere uma resposta do Concierge para uma situação potencialmente grave. Procure atendimento de urgência imediatamente.
              </div>
            )}
          </div>
        )}
      </section>

      {(category === 'exam_review' || category === 'second_analysis') && (
        <section className="rounded-2xl border bg-slate-50 p-4 text-sm text-slate-700">
          Seus exames continuam no HealthWallet. Se algum documento ainda não estiver lá, use <button type="button" onClick={() => navigate('/upload')} className="font-bold text-emerald-700 underline">Enviar exame</button> e depois volte para concluir a solicitação.
        </section>
      )}

      <button
        type="button"
        disabled={submitting}
        onClick={submit}
        className="w-full rounded-2xl bg-emerald-700 px-4 py-4 font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        Enviar para minha equipe
      </button>
    </div>
  )
}
