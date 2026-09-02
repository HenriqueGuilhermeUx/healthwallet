import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  HeartPulse,
  Loader2,
  Moon,
  RefreshCw,
  Scale,
  Share2,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Watch,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import {
  connectDeviceProvider,
  DeviceDailySummaryInput,
  DeviceProvider,
  getProviderLabel,
  loadDeviceData,
  shareDeviceDataWithProfessional,
  summarizeDeviceWindow,
  todayIsoDate,
  upsertDeviceDailySummary,
} from '@/services/deviceData'
import {
  getNativeHealthAvailability,
  getNativeProviderForPlatform,
  openNativeHealthSettings,
  showNativeHealthPrivacyPolicy,
  syncNativeHealthData,
} from '@/services/nativeHealthSync'

const providerOptions: Array<{ provider: DeviceProvider; title: string; subtitle: string; native: boolean }> = [
  {
    provider: 'health_connect',
    title: 'Android Health Connect',
    subtitle: 'Sincronização automática com smartwatches, pulseiras e apps Android compatíveis.',
    native: true,
  },
  {
    provider: 'apple_health',
    title: 'Apple Saúde',
    subtitle: 'Sincronização automática com iPhone, Apple Watch e apps compatíveis.',
    native: true,
  },
  {
    provider: 'manual',
    title: 'Registro manual / contingência',
    subtitle: 'Plano B para testes, pilotos assistidos e casos sem dispositivo conectado.',
    native: false,
  },
]

const emptyForm = {
  summary_date: todayIsoDate(),
  steps: '',
  sleep_hours: '',
  resting_heart_rate: '',
  avg_heart_rate: '',
  spo2_avg: '',
  systolic_bp: '',
  diastolic_bp: '',
  weight_kg: '',
}

export default function DeviceData() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [nativeSyncing, setNativeSyncing] = useState<DeviceProvider | null>(null)
  const [autoSyncing, setAutoSyncing] = useState(false)
  const [connections, setConnections] = useState<any[]>([])
  const [summaries, setSummaries] = useState<any[]>([])
  const [consents, setConsents] = useState<any[]>([])
  const [careLinks, setCareLinks] = useState<any[]>([])
  const [form, setForm] = useState(emptyForm)
  const [systemNotice, setSystemNotice] = useState('')
  const [nativeAvailability, setNativeAvailability] = useState<any>(null)

  useEffect(() => {
    load()
  }, [user])

  async function load(allowAutoSync = true) {
    if (!user) return
    setLoading(true)
    setSystemNotice('')

    try {
      const [deviceData, linksRes, availability] = await Promise.all([
        loadDeviceData(user.id),
        supabase
          .from('professional_care_links')
          .select('*')
          .eq('patient_id', user.id)
          .eq('status', 'active')
          .order('updated_at', { ascending: false }),
        getNativeHealthAvailability(),
      ])

      if (deviceData.error) {
        console.warn('Device data tables unavailable:', deviceData.error.message)
        setSystemNotice('Execute o SQL HEALTHWALLET_DEVICE_DATA_HUB_V1 no Supabase para ativar dispositivos, consentimento e score contextual.')
      }

      const loadedConnections = deviceData.connections || []
      setConnections(loadedConnections)
      setSummaries(deviceData.summaries || [])
      setConsents(deviceData.consents || [])
      setCareLinks(linksRes.data || [])
      setNativeAvailability(availability)

      if (allowAutoSync) void autoSyncIfDue(loadedConnections, availability)
    } catch (error) {
      console.warn('Device data loading skipped:', error)
      setSystemNotice('Os dados de dispositivos serão exibidos aqui após aplicar o SQL do Device Data Hub no Supabase.')
    } finally {
      setLoading(false)
    }
  }

  async function autoSyncIfDue(loadedConnections: any[], availability: any) {
    if (!user || !availability?.available) return

    const provider = getNativeProviderForPlatform()
    if (!provider) return

    const activeConnection = loadedConnections.find((item) => item.provider === provider && item.status !== 'revoked')
    if (!activeConnection) return

    const key = `healthwallet_auto_sync_${user.id}_${provider}`
    const last = Number(localStorage.getItem(key) || 0)
    const sixHours = 6 * 60 * 60 * 1000
    if (Date.now() - last < sixHours) return

    setAutoSyncing(true)
    try {
      const result = await syncNativeHealthData(user.id, provider, { days: 7, requestAuthorization: false })
      localStorage.setItem(key, String(Date.now()))
      if (result.days_synced > 0) toast.success(`Sincronização automática atualizada: ${result.days_synced} dia(s)`)
      await load(false)
    } catch (error) {
      console.warn('Automatic native sync skipped:', error)
    } finally {
      setAutoSyncing(false)
    }
  }

  async function handleConnect(provider: DeviceProvider) {
    if (!user) return

    if (provider === 'manual') {
      const { error } = await connectDeviceProvider(user.id, provider)
      if (error) toast.error('Não foi possível criar a conexão agora.')
      else toast.success('Registro manual habilitado como contingência')
      load()
      return
    }

    setNativeSyncing(provider)
    try {
      const result = await syncNativeHealthData(user.id, provider as 'health_connect' | 'apple_health', {
        days: 14,
        requestAuthorization: true,
        requestHistoryAccess: true,
      })
      toast.success(result.days_synced ? `Dispositivo conectado: ${result.days_synced} dia(s) sincronizado(s)` : 'Permissão concedida. Novos dados aparecerão após o dispositivo gerar leituras.')
      load(false)
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível conectar a fonte nativa agora.')
    } finally {
      setNativeSyncing(null)
    }
  }

  async function syncNow() {
    if (!user) return

    const provider = getNativeProviderForPlatform()
    if (!provider) {
      toast.error('Sincronização automática funciona no app instalado no celular.')
      return
    }

    setNativeSyncing(provider)
    try {
      const result = await syncNativeHealthData(user.id, provider, { days: 14, requestAuthorization: true, requestHistoryAccess: true })
      toast.success(result.days_synced ? `Sincronização concluída: ${result.days_synced} dia(s)` : 'Nenhum dado novo encontrado no período.')
      load(false)
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível sincronizar agora.')
    } finally {
      setNativeSyncing(null)
    }
  }

  async function openSettings() {
    try {
      await openNativeHealthSettings()
    } catch {
      toast.error('Configurações nativas disponíveis apenas no app instalado.')
    }
  }

  async function openPrivacyPolicy() {
    try {
      await showNativeHealthPrivacyPolicy()
    } catch {
      toast.error('Política nativa disponível no app instalado.')
    }
  }

  async function saveManualSummary() {
    if (!user) return
    setSaving(true)

    try {
      const payload: DeviceDailySummaryInput = {
        user_id: user.id,
        summary_date: form.summary_date || todayIsoDate(),
        sources: ['manual'],
        steps: parseOptionalNumber(form.steps),
        sleep_minutes: form.sleep_hours ? Math.round(Number(form.sleep_hours) * 60) : null,
        resting_heart_rate: parseOptionalNumber(form.resting_heart_rate),
        avg_heart_rate: parseOptionalNumber(form.avg_heart_rate),
        spo2_avg: parseOptionalNumber(form.spo2_avg),
        systolic_bp: parseOptionalNumber(form.systolic_bp),
        diastolic_bp: parseOptionalNumber(form.diastolic_bp),
        weight_kg: parseOptionalNumber(form.weight_kg),
        metadata: {
          source: 'manual_mvp',
          note: 'Entrada manual usada como contingência para validar HealthWallet Device Data Hub e MedScore contextual.',
        },
      }

      const { error } = await upsertDeviceDailySummary(payload)
      if (error) throw error

      await supabase.from('health_data_audit_logs').insert({
        patient_id: user.id,
        actor_user_id: user.id,
        actor_role: 'patient',
        action: 'device_manual_summary_saved',
        data_category: 'device_data',
        source_app: 'healthwallet_mobile',
        metadata: { summary_date: payload.summary_date },
      })

      toast.success('Dados salvos e prontos para compor o MedScore')
      setForm({ ...emptyForm, summary_date: payload.summary_date })
      load()
    } catch (error: any) {
      console.warn('Could not save device summary:', error)
      toast.error(error?.message || 'Não foi possível salvar os dados.')
    } finally {
      setSaving(false)
    }
  }

  async function shareWith(link: any) {
    if (!user) return

    const alreadyShared = consents.some((item) =>
      item.care_link_id === link.id && item.status === 'active'
    )

    if (alreadyShared) {
      toast.info('Dados de dispositivos já estão autorizados para este profissional.')
      return
    }

    const { error } = await shareDeviceDataWithProfessional(user.id, link)
    if (error) {
      toast.error('Não foi possível compartilhar agora.')
      return
    }

    await supabase.from('health_data_audit_logs').insert({
      patient_id: user.id,
      actor_user_id: user.id,
      actor_role: 'patient',
      action: 'device_data_shared_with_professional',
      data_category: 'device_data',
      source_app: 'healthwallet_mobile',
      metadata: {
        care_link_id: link.id,
        professional_id: link.professional_id,
        professional_name: link.professional_name,
      },
    })

    toast.success('Compartilhamento autorizado')
    load()
  }

  const windowSummary = useMemo(() => summarizeDeviceWindow(summaries), [summaries])
  const latest = windowSummary.latest
  const nativeProvider = getNativeProviderForPlatform()
  const nativeProviderLabel = nativeProvider ? getProviderLabel(nativeProvider) : 'app instalado no celular'

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>
  }

  return (
    <div className="space-y-5 pb-24">
      <section className="rounded-2xl bg-gradient-to-br from-slate-900 via-emerald-900 to-teal-800 p-5 text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-white/10" />
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-3">
            <Watch className="w-4 h-4" /> HealthWallet Device Data Hub
          </div>
          <h1 className="text-2xl font-bold">Meus dispositivos</h1>
          <p className="text-white/85 text-sm mt-2">
            Sincronize automaticamente passos, sono, batimentos, pressão, peso e SpO2 para enriquecer seu histórico e refinar o MedScore.
          </p>
        </div>
      </section>

      <section className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900 flex gap-2">
        <ShieldCheck className="w-5 h-5 flex-shrink-0" />
        <p>
          Você controla o acesso. Dados de dispositivos são complementares, podem variar por aparelho e não substituem avaliação profissional.
        </p>
      </section>

      {systemNotice && (
        <section className="rounded-xl bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-900 flex gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p>{systemNotice}</p>
        </section>
      )}

      <section className="rounded-xl bg-white border p-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
            <RefreshCw className={`w-5 h-5 ${autoSyncing ? 'animate-spin' : ''}`} />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-gray-900">Sincronização automática</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Fonte deste aparelho: {nativeProviderLabel}. O app atualiza os dados ao abrir a tela e você pode sincronizar agora.
            </p>
            {!nativeAvailability?.available && (
              <p className="text-xs text-amber-700 mt-2">
                {nativeAvailability?.reason || 'Instale o app no celular e autorize Apple Saúde ou Health Connect.'}
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
          <button
            type="button"
            onClick={syncNow}
            disabled={Boolean(nativeSyncing)}
            className="rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-60"
          >
            {nativeSyncing ? 'Sincronizando...' : 'Sincronizar agora'}
          </button>
          <button type="button" onClick={openSettings} className="rounded-xl border py-3 font-semibold text-gray-700">
            Permissões
          </button>
          <button type="button" onClick={openPrivacyPolicy} className="rounded-xl border py-3 font-semibold text-gray-700">
            Privacidade
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <MetricCard icon={Activity} label="Passos 7d" value={formatNumber(windowSummary.avgSteps)} />
        <MetricCard icon={Moon} label="Sono 7d" value={formatSleep(windowSummary.avgSleepMinutes)} />
        <MetricCard icon={HeartPulse} label="FC repouso" value={windowSummary.avgRestingHeartRate ? `${windowSummary.avgRestingHeartRate} bpm` : '—'} />
        <MetricCard icon={Scale} label="Score device" value={windowSummary.avgDeviceScore ? `${windowSummary.avgDeviceScore}/100` : '—'} />
      </section>

      {latest && (
        <section className="bg-white rounded-xl border p-4">
          <h2 className="font-bold mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-600" /> Última sincronização
          </h2>
          <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
            <p>Data: <strong>{formatDate(latest.summary_date)}</strong></p>
            <p>Fonte: <strong>{(latest.sources || ['manual']).join(', ')}</strong></p>
            <p>SpO2: <strong>{latest.spo2_avg ? `${latest.spo2_avg}%` : '—'}</strong></p>
            <p>Pressão: <strong>{latest.systolic_bp && latest.diastolic_bp ? `${latest.systolic_bp}/${latest.diastolic_bp}` : '—'}</strong></p>
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-emerald-600" /> Fontes de dados
        </h2>
        <div className="space-y-3">
          {providerOptions.map((option) => {
            const connected = connections.some((item) => item.provider === option.provider && item.status !== 'revoked')
            const isCurrentNative = option.provider === nativeProvider
            const disabledNative = option.native && !isCurrentNative
            return (
              <div key={option.provider} className="rounded-xl border p-3 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
                  {option.provider === 'manual' ? <Activity className="w-5 h-5" /> : <Watch className="w-5 h-5" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">{option.title}</p>
                    {connected && <CheckCircle className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{option.subtitle}</p>
                  {disabledNative && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      Disponível no {option.provider === 'apple_health' ? 'iPhone' : 'Android'}.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleConnect(option.provider)}
                  disabled={Boolean(nativeSyncing) || disabledNative}
                  className="text-xs rounded-lg bg-emerald-600 px-3 py-2 font-semibold text-white disabled:opacity-50"
                >
                  {nativeSyncing === option.provider ? 'Sincronizando' : connected ? 'Atualizar' : option.native ? 'Conectar' : 'Ativar'}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <details className="bg-white rounded-xl border p-4">
        <summary className="font-bold cursor-pointer flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-emerald-600" /> Registro manual de contingência
        </summary>
        <p className="text-sm text-muted-foreground mt-3">
          O fluxo principal é automático. O registro manual fica apenas para pilotos acompanhados, suporte e casos sem dispositivo compatível.
        </p>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Field label="Data" type="date" value={form.summary_date} onChange={(value) => setForm({ ...form, summary_date: value })} />
          <Field label="Passos" value={form.steps} onChange={(value) => setForm({ ...form, steps: value })} />
          <Field label="Sono (horas)" value={form.sleep_hours} onChange={(value) => setForm({ ...form, sleep_hours: value })} />
          <Field label="FC repouso" value={form.resting_heart_rate} onChange={(value) => setForm({ ...form, resting_heart_rate: value })} />
          <Field label="FC média" value={form.avg_heart_rate} onChange={(value) => setForm({ ...form, avg_heart_rate: value })} />
          <Field label="SpO2 (%)" value={form.spo2_avg} onChange={(value) => setForm({ ...form, spo2_avg: value })} />
          <Field label="Pressão sistólica" value={form.systolic_bp} onChange={(value) => setForm({ ...form, systolic_bp: value })} />
          <Field label="Pressão diastólica" value={form.diastolic_bp} onChange={(value) => setForm({ ...form, diastolic_bp: value })} />
          <Field label="Peso (kg)" value={form.weight_kg} onChange={(value) => setForm({ ...form, weight_kg: value })} />
        </div>
        <button
          type="button"
          onClick={saveManualSummary}
          disabled={saving}
          className="mt-4 w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Salvando...' : 'Salvar contingência'}
        </button>
      </details>

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <Share2 className="w-5 h-5 text-emerald-600" /> Compartilhar com profissional
        </h2>
        <p className="text-sm text-muted-foreground mb-3">
          Autorize dados de dispositivos somente para profissionais vinculados e ativos.
        </p>

        {careLinks.length === 0 ? (
          <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            Nenhum vínculo profissional ativo ainda. Aprove uma solicitação em Vínculos para compartilhar.
          </div>
        ) : (
          <div className="space-y-2">
            {careLinks.map((link) => {
              const active = consents.some((item) => item.care_link_id === link.id && item.status === 'active')
              return (
                <div key={link.id} className="rounded-xl border p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <Stethoscope className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{link.professional_name || 'Profissional de saúde'}</p>
                    <p className="text-xs text-muted-foreground truncate">{link.professional_email || 'E-mail não informado'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => shareWith(link)}
                    className={`text-xs rounded-lg px-3 py-2 font-semibold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-600 text-white'}`}
                  >
                    {active ? 'Autorizado' : 'Autorizar'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <Link to="/medscore" className="block text-center rounded-xl bg-slate-900 py-3 font-semibold text-white">
        Ver MedScore com dados de dispositivos
      </Link>
    </div>
  )
}

function Field({ label, value, onChange, type = 'number' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="text-sm">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-emerald-500"
        inputMode={type === 'number' ? 'decimal' : undefined}
      />
    </label>
  )
}

function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white border p-4">
      <Icon className="w-5 h-5 text-emerald-600 mb-2" />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function parseOptionalNumber(value: string) {
  if (!value) return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function formatNumber(value: number | null) {
  return value ? value.toLocaleString('pt-BR') : '—'
}

function formatSleep(minutes: number | null) {
  if (!minutes) return '—'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h${String(mins).padStart(2, '0')}`
}

function formatDate(value?: string) {
  if (!value) return '—'
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
}
