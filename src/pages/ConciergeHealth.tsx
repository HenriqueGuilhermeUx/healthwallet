import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  ChevronRight,
  FileText,
  HeartPulse,
  Loader2,
  Moon,
  Pill,
  Scale,
  ShieldCheck,
  Stethoscope,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { loadDeviceData, type DeviceDailySummary } from '@/services/deviceData'

function average(values: Array<number | null | undefined>) {
  const valid = values.map(Number).filter((value) => Number.isFinite(value))
  if (!valid.length) return null
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function formatNumber(value: number | null, digits = 0) {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits })
}

function trend(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

export default function ConciergeHealth() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [scores, setScores] = useState<any[]>([])
  const [summaries, setSummaries] = useState<DeviceDailySummary[]>([])
  const [connections, setConnections] = useState<any[]>([])
  const [examCount, setExamCount] = useState(0)
  const [medicationCount, setMedicationCount] = useState(0)
  const [timelineCount, setTimelineCount] = useState(0)

  useEffect(() => {
    if (!user) return
    void load()
  }, [user?.id])

  async function load() {
    if (!user) return
    setLoading(true)
    try {
      const [scoreRes, deviceData, examsRes, medsRes, timelineRes] = await Promise.all([
        supabase.from('health_scores').select('score,status,factors,calculated_at').eq('user_id', user.id).order('calculated_at', { ascending: false }).limit(2),
        loadDeviceData(user.id),
        supabase.from('medical_records').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('medications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', true),
        supabase.from('medical_timeline').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ])

      setScores(scoreRes.data || [])
      setSummaries(deviceData.summaries || [])
      setConnections((deviceData.connections || []).filter((item: any) => item.status === 'connected'))
      setExamCount(examsRes.count || 0)
      setMedicationCount(medsRes.count || 0)
      setTimelineCount(timelineRes.count || 0)
    } catch (error) {
      console.warn('Concierge longitudinal health cockpit loaded partially:', error)
    } finally {
      setLoading(false)
    }
  }

  const latestScore = scores[0] || null
  const previousScore = scores[1] || null
  const scoreDelta = latestScore && previousScore ? Number(latestScore.score || 0) - Number(previousScore.score || 0) : null

  const sorted = useMemo(() => [...summaries].sort((a, b) => String(b.summary_date).localeCompare(String(a.summary_date))), [summaries])
  const latest = sorted[0] || null
  const last7 = sorted.slice(0, 7)
  const prior7 = sorted.slice(7, 14)

  const metrics = useMemo(() => {
    const currentSteps = average(last7.map((item) => item.steps))
    const previousSteps = average(prior7.map((item) => item.steps))
    const currentSleep = average(last7.map((item) => item.sleep_minutes))
    const previousSleep = average(prior7.map((item) => item.sleep_minutes))
    const currentRhr = average(last7.map((item) => item.resting_heart_rate))
    const previousRhr = average(prior7.map((item) => item.resting_heart_rate))
    const currentWeight = average(last7.map((item) => item.weight_kg))
    const previousWeight = average(prior7.map((item) => item.weight_kg))

    return {
      steps: { value: currentSteps, delta: trend(currentSteps, previousSteps) },
      sleep: { value: currentSleep, delta: trend(currentSleep, previousSleep) },
      rhr: { value: currentRhr, delta: trend(currentRhr, previousRhr) },
      weight: { value: currentWeight, delta: trend(currentWeight, previousWeight) },
    }
  }, [last7, prior7])

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
  }

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-teal-950 to-emerald-800 p-5 text-white">
        <button type="button" onClick={() => navigate('/concierge')} className="mb-4 flex items-center gap-2 text-sm text-white/70"><ArrowLeft className="h-4 w-4" /> Concierge</button>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/60"><HeartPulse className="h-4 w-4" /> Visão longitudinal</div>
        <h1 className="mt-2 text-2xl font-bold">Minha Saúde</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/75">Uma visão consolidada do que você já mantém na HealthWallet e dos sinais contínuos que ajudam a acompanhar sua evolução.</p>
      </section>

      <Link to="/medscore" className="block rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">MedScore</p>
            <div className="mt-1 flex items-end gap-2"><span className="text-4xl font-bold">{latestScore?.score ?? '—'}</span>{latestScore?.score != null && <span className="pb-1 text-sm text-muted-foreground">/100</span>}</div>
            {scoreDelta != null && scoreDelta !== 0 && <p className="mt-1 text-xs text-muted-foreground">{scoreDelta > 0 ? '↑' : '↓'} {Math.abs(scoreDelta)} ponto(s) desde a avaliação anterior</p>}
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">O MedScore organiza contexto clínico e evolução. Dados de dispositivos complementam essa leitura e não geram diagnóstico automático.</p>
      </Link>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="font-bold">Últimos 7 dias</h2><p className="mt-1 text-xs text-muted-foreground">Comparação com os 7 dias anteriores quando houver dados suficientes.</p></div><Link to="/devices" className="text-xs font-semibold text-emerald-700">Ver dispositivos</Link></div>
        <div className="grid grid-cols-2 gap-3">
          <TrendCard icon={Activity} label="Passos / dia" value={formatNumber(metrics.steps.value)} delta={metrics.steps.delta} />
          <TrendCard icon={Moon} label="Sono / dia" value={metrics.sleep.value == null ? '—' : `${formatNumber(metrics.sleep.value / 60, 1)} h`} delta={metrics.sleep.delta} />
          <TrendCard icon={HeartPulse} label="FC repouso" value={metrics.rhr.value == null ? '—' : `${formatNumber(metrics.rhr.value)} bpm`} delta={metrics.rhr.delta} invert />
          <TrendCard icon={Scale} label="Peso médio" value={metrics.weight.value == null ? '—' : `${formatNumber(metrics.weight.value, 1)} kg`} delta={metrics.weight.delta} neutral />
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between"><div><p className="font-bold">Último registro contínuo</p><p className="mt-1 text-xs text-muted-foreground">{latest?.summary_date || 'Nenhum resumo sincronizado'}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">{connections.length} fonte(s)</span></div>
        {latest ? (
          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
            <Metric label="Pressão" value={latest.systolic_bp != null || latest.diastolic_bp != null ? `${latest.systolic_bp ?? '—'}/${latest.diastolic_bp ?? '—'}` : '—'} />
            <Metric label="SpO₂" value={latest.spo2_avg != null ? `${formatNumber(latest.spo2_avg, 1)}%` : '—'} />
            <Metric label="Atividade" value={latest.activity_minutes != null ? `${formatNumber(latest.activity_minutes)} min` : '—'} />
            <Metric label="Calorias ativas" value={latest.active_calories != null ? `${formatNumber(latest.active_calories)} kcal` : '—'} />
          </div>
        ) : <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-muted-foreground">Quando o HealthWallet Connect sincronizar seus dados autorizados, as tendências aparecerão aqui.</p>}
      </section>

      <section>
        <h2 className="mb-3 font-bold">Meu histórico organizado</h2>
        <div className="space-y-2">
          <HealthLink icon={FileText} title="Exames" value={`${examCount} registro(s)`} href="/exams" />
          <HealthLink icon={Pill} title="Medicamentos ativos" value={`${medicationCount} registro(s)`} href="/medications" />
          <HealthLink icon={Activity} title="Linha do tempo" value={`${timelineCount} evento(s)`} href="/timeline" />
          <HealthLink icon={ShieldCheck} title="Medical Passport" value="Resumo para compartilhar" href="/passport" />
        </div>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3"><Stethoscope className="h-5 w-5 flex-shrink-0 text-blue-700" /><div><p className="text-sm font-bold text-blue-950">Viu algo que quer entender?</p><p className="mt-1 text-xs leading-relaxed text-blue-900/75">Transforme a dúvida em um caso acompanhado. Sua equipe recebe contexto somente dentro do que você autorizou para o Concierge.</p><Link to="/concierge/request?category=guidance" className="mt-3 inline-flex rounded-xl bg-blue-900 px-4 py-2.5 text-xs font-bold text-white">Falar com minha equipe</Link></div></div>
      </section>

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">Dados de dispositivos e tendências são complementares e podem conter variações de medição. Eles não substituem avaliação profissional nem atendimento de urgência.</p>
    </div>
  )
}

function TrendCard({ icon: Icon, label, value, delta, invert = false, neutral = false }: { icon: any; label: string; value: string; delta: number | null; invert?: boolean; neutral?: boolean }) {
  const meaningful = delta != null && Math.abs(delta) >= 1
  const favorable = !neutral && meaningful ? (invert ? delta < 0 : delta > 0) : null
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4" /><span className="text-xs">{label}</span></div>
      <p className="mt-2 text-xl font-bold">{value}</p>
      {meaningful ? <div className={`mt-2 flex items-center gap-1 text-[11px] font-semibold ${favorable === true ? 'text-emerald-700' : favorable === false ? 'text-amber-700' : 'text-slate-600'}`}>{delta! > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}{Math.abs(delta!).toFixed(0)}% vs. período anterior</div> : <p className="mt-2 text-[11px] text-muted-foreground">Sem comparação suficiente</p>}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-bold">{value}</p></div>
}

function HealthLink({ icon: Icon, title, value, href }: { icon: any; title: string; value: string; href: string }) {
  return <Link to={href} className="flex items-center gap-3 rounded-2xl border bg-white p-4"><div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center"><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{value}</p></div><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>
}
