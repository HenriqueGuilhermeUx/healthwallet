import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, MapPin, Phone, Shield, CheckCircle, XCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { createMedicalEvent } from '@/services/medicalTimeline'

type LocationState = {
  latitude: number
  longitude: number
  accuracy?: number
}

export default function Emergency() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [contacts, setContacts] = useState<any[]>([])
  const [familyContacts, setFamilyContacts] = useState<any[]>([])
  const [lastEvent, setLastEvent] = useState<any>(null)
  const [location, setLocation] = useState<LocationState | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [user])

  async function load() {
    if (!user) return

    setLoading(true)

    try {
      const [profileRes, contactsRes, familyRes, eventRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('emergency_contacts').select('*').eq('user_id', user.id).order('is_primary', { ascending: false }),
        supabase.from('family_members').select('*').eq('user_id', user.id).eq('notify_sos', true).order('created_at', { ascending: false }),
        supabase.from('sos_events').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])

      setProfile(profileRes.data || null)
      setContacts(contactsRes.data || [])
      setFamilyContacts(familyRes.data || [])
      setLastEvent(eventRes.data || null)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function getLocation(): Promise<LocationState | null> {
    if (!navigator.geolocation) return null

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          })
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      )
    })
  }

  async function triggerHelp() {
    if (!user) return

    const ok = confirm('Acionar ajuda rápida e registrar evento no HealthWallet?')
    if (!ok) return

    setTriggering(true)
    setError('')

    try {
      const currentLocation = await getLocation()
      setLocation(currentLocation)

      const notified = [...contacts, ...familyContacts]
        .filter((item) => item.phone || item.email)
        .map((item) => ({
          name: item.name,
          phone: item.phone || null,
          email: item.email || null,
          relationship: item.relationship || null,
        }))

      const { data, error: insertError } = await supabase
        .from('sos_events')
        .insert({
          user_id: user.id,
          triggered_by_user_id: user.id,
          status: 'active',
          message: 'Ajuda rápida acionada pelo HealthWallet.',
          latitude: currentLocation?.latitude || null,
          longitude: currentLocation?.longitude || null,
          accuracy: currentLocation?.accuracy || null,
          notified_contacts: notified,
        })
        .select()
        .single()

      if (insertError) throw insertError

      await createMedicalEvent({
        userId: user.id,
        type: 'sos',
        title: 'Ajuda rápida acionada',
        description: currentLocation
          ? `Localização registrada: ${currentLocation.latitude}, ${currentLocation.longitude}`
          : 'Evento registrado sem localização.',
      })

      setLastEvent(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Não consegui registrar o evento agora.')
    } finally {
      setTriggering(false)
    }
  }

  async function closeEvent(status: 'resolved' | 'false_alarm') {
    if (!lastEvent) return

    await supabase
      .from('sos_events')
      .update({
        status,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', lastEvent.id)

    setLastEvent(null)
    load()
  }

  const primaryContact = contacts.find((item) => item.is_primary) || contacts[0] || familyContacts.find((item) => item.phone)
  const patientName = profile?.full_name || profile?.name || user?.email || 'Paciente'
  const mapLatitude = location?.latitude || lastEvent?.latitude
  const mapLongitude = location?.longitude || lastEvent?.longitude

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl bg-gradient-to-br from-red-700 to-orange-700 text-white p-5">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">SOS / Ajuda Rápida</h1>
            <p className="text-white/80 text-sm">Botão rápido para idosos, familiares e cuidadores.</p>
          </div>
        </div>
      </div>

      {lastEvent && (
        <section className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
          <p className="font-bold text-red-900">Evento ativo</p>
          <p className="text-sm text-red-700">Acionado em {new Date(lastEvent.created_at).toLocaleString('pt-BR')}.</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => closeEvent('resolved')} className="py-3 rounded-xl bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> Resolvido
            </button>
            <button onClick={() => closeEvent('false_alarm')} className="py-3 rounded-xl border border-red-200 text-red-700 font-semibold flex items-center justify-center gap-2">
              <XCircle className="w-4 h-4" /> Alarme falso
            </button>
          </div>
        </section>
      )}

      <button
        onClick={triggerHelp}
        disabled={triggering}
        className="w-full min-h-[96px] rounded-2xl bg-red-600 text-white font-bold text-xl flex items-center justify-center gap-3 shadow-lg disabled:opacity-60"
      >
        {triggering ? <Loader2 className="w-7 h-7 animate-spin" /> : <AlertTriangle className="w-8 h-8" />}
        {triggering ? 'Registrando...' : 'ACIONAR AJUDA'}
      </button>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3">
        <a href="tel:192" className="py-4 rounded-xl bg-white border border-red-200 text-red-700 font-semibold flex flex-col items-center justify-center gap-2">
          <Phone className="w-6 h-6" /> Ligar 192
        </a>
        <a href={primaryContact?.phone ? `tel:${primaryContact.phone}` : '#'} className="py-4 rounded-xl bg-white border border-orange-200 text-orange-700 font-semibold flex flex-col items-center justify-center gap-2">
          <Phone className="w-6 h-6" /> Contato principal
        </a>
      </div>

      {mapLatitude && mapLongitude && (
        <a href={`https://maps.google.com/?q=${mapLatitude},${mapLongitude}`} target="_blank" rel="noreferrer" className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold flex items-center justify-center gap-2">
          <MapPin className="w-5 h-5" /> Abrir localização
        </a>
      )}

      <section className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-600" />
          <h2 className="font-bold">Dados rápidos</h2>
        </div>
        <Info label="Paciente" value={patientName} />
        <Info label="Tipo sanguíneo" value={profile?.blood_type || 'Não informado'} />
        <Info label="Alergias" value={Array.isArray(profile?.allergies) ? profile.allergies.join(', ') : profile?.allergies || 'Não informado'} />
        <Info label="Condições" value={profile?.chronic_conditions || 'Não informado'} />
        <Info label="Medicamentos atuais" value={profile?.current_medications || 'Não informado'} />
      </section>

      <section className="bg-white rounded-xl border p-4 space-y-3">
        <h2 className="font-bold">Contatos que recebem alerta</h2>
        {[...contacts, ...familyContacts].length > 0 ? (
          <div className="space-y-2">
            {[...contacts, ...familyContacts].map((contact, idx) => (
              <div key={contact.id || idx} className="bg-gray-50 rounded-xl p-3 text-sm">
                <p className="font-semibold">{contact.name}</p>
                <p className="text-muted-foreground">{[contact.relationship, contact.phone, contact.email].filter(Boolean).join(' · ')}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Cadastre familiares na tela Família para alertas rápidos.</p>
        )}
      </section>
    </div>
  )
}

function Info({ label, value }: any) {
  return (
    <div className="bg-muted/40 rounded-lg p-3 text-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value || 'Não informado'}</p>
    </div>
  )
}
