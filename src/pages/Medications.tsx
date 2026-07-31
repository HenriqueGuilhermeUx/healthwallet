import { useEffect, useState } from 'react'
import {
  Barcode,
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  Package,
  Pill,
  Plus,
  Shield,
  ShoppingCart,
  Smartphone,
  Store,
  TimerReset,
  Trash2,
  Users,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { createMedicalEvent } from '@/services/medicalTimeline'
import { buildIfoodSearchUrl, buildPharmacySearchQuery, sanitizeEan, trackExternalPharmacyClick } from '@/services/pharmacyRedirect'

interface Medication {
  id: string
  name: string
  dosage?: string | null
  frequency?: string | null
  start_date?: string | null
  end_date?: string | null
  reminder_time?: string | null
  is_active: boolean
  target_family_member_id?: string | null
  target_name?: string | null
  notify_caregivers?: boolean
  critical_medication?: boolean
  stock_quantity?: number | null
  pills_per_day?: number | null
  stock_alert_threshold?: number | null
  last_taken_at?: string | null
  allow_repurchase_offers?: boolean
  last_repurchase_requested_at?: string | null
  ean_code?: string | null
  active_ingredient?: string | null
  standardized_dosage?: string | null
  pharmaceutical_form?: string | null
  manufacturer?: string | null
  normalized_product_name?: string | null
  pharmacy_search_key?: string | null
}

interface FamilyMember {
  id: string
  name: string
  relationship?: string
  notify_medications?: boolean
}

const emptyForm = {
  name: '',
  dosage: '',
  frequency: 'Todos os dias',
  reminder_days: 'Todos os dias',
  reminder_time: '',
  start_date: '',
  end_date: '',
  target_family_member_id: 'self',
  notify_caregivers: false,
  critical_medication: false,
  stock_quantity: '',
  pills_per_day: '',
  stock_alert_threshold: '5',
  ean_code: '',
  active_ingredient: '',
  standardized_dosage: '',
  pharmaceutical_form: '',
  manufacturer: '',
  normalized_product_name: '',
  allow_repurchase_offers: false,
  notify_push: true,
  notify_email: false,
  notify_calendar: true,
}

export default function Medications() {
  const { user } = useAuth()
  const [medications, setMedications] = useState<Medication[]>([])
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [requestingId, setRequestingId] = useState<string | null>(null)
  const [externalOpeningId, setExternalOpeningId] = useState<string | null>(null)
  const [formData, setFormData] = useState<any>(emptyForm)

  useEffect(() => {
    loadData()
  }, [user])

  async function loadData() {
    if (!user) return
    setLoading(true)

    try {
      const [medsRes, familyRes] = await Promise.all([
        supabase.from('medications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('family_members').select('id,name,relationship,notify_medications').eq('user_id', user.id).order('created_at', { ascending: false }),
      ])
      setMedications(medsRes.data || [])
      setFamilyMembers(familyRes.data || [])
    } catch (error) {
      console.error('Error loading medications:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddMedication() {
    if (!user || !formData.name) {
      alert('Informe o nome do medicamento')
      return
    }

    const targetMember = familyMembers.find((item) => item.id === formData.target_family_member_id)
    const targetName = targetMember?.name || 'Eu'
    const targetFamilyMemberId = formData.target_family_member_id === 'self' ? null : formData.target_family_member_id
    const frequencyText = [formData.frequency, formData.reminder_days ? `Dias: ${formData.reminder_days}` : ''].filter(Boolean).join(' · ')
    const eanCode = sanitizeEan(formData.ean_code)
    const standardizedDosage = formData.standardized_dosage || formData.dosage
    const normalizedProductName = formData.normalized_product_name || formData.name
    const pharmacySearchKey = buildLocalPharmacySearchKey({
      name: normalizedProductName,
      active_ingredient: formData.active_ingredient,
      standardized_dosage: standardizedDosage,
      pharmaceutical_form: formData.pharmaceutical_form,
      manufacturer: formData.manufacturer,
    })

    try {
      const payload = {
        user_id: user.id,
        target_user_id: user.id,
        target_family_member_id: targetFamilyMemberId,
        target_name: targetName,
        name: formData.name,
        dosage: formData.dosage,
        frequency: frequencyText,
        reminder_time: formData.reminder_time || null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        notify_caregivers: formData.notify_caregivers,
        critical_medication: formData.critical_medication,
        stock_quantity: formData.stock_quantity ? Number(formData.stock_quantity) : null,
        pills_per_day: formData.pills_per_day ? Number(formData.pills_per_day) : null,
        stock_alert_threshold: formData.stock_alert_threshold ? Number(formData.stock_alert_threshold) : 5,
        ean_code: eanCode || null,
        active_ingredient: formData.active_ingredient || null,
        standardized_dosage: standardizedDosage || null,
        pharmaceutical_form: formData.pharmaceutical_form || null,
        manufacturer: formData.manufacturer || null,
        normalized_product_name: normalizedProductName || null,
        pharmacy_search_key: pharmacySearchKey || null,
        product_mapping_status: eanCode ? 'ean' : pharmacySearchKey ? 'substance_dosage' : 'unmapped',
        product_mapping_metadata: {
          source: 'manual_medication_form',
          ean_present: Boolean(eanCode),
          fallback_strategy: 'active_ingredient_standardized_dosage_form',
        },
        allow_repurchase_offers: formData.allow_repurchase_offers,
        repurchase_metadata: {
          consent_source: 'medication_form',
          consent_text: 'Quero receber lembretes de recompra e opcoes de farmacias parceiras para medicamentos que eu cadastrar.',
          channels: {
            push: formData.notify_push,
            email: formData.notify_email,
            calendar: formData.notify_calendar,
          },
        },
        is_active: true,
      }

      const { data, error } = await supabase.from('medications').insert(payload).select().single()
      if (error) throw error

      await createMedicalEvent({
        userId: user.id,
        type: 'medication',
        title: `${targetName}: ${formData.name}`,
        description: [
          formData.dosage ? `Dosagem: ${formData.dosage}` : '',
          eanCode ? `EAN: ${eanCode}` : '',
          formData.active_ingredient ? `Substância: ${formData.active_ingredient}` : '',
          formData.allow_repurchase_offers ? 'Reposição inteligente autorizada' : '',
        ].filter(Boolean).join(' · '),
        eventDate: formData.start_date || new Date().toISOString().slice(0, 10),
      })

      if (formData.reminder_time) {
        await supabase.from('health_reminders').insert({
          user_id: user.id,
          target_family_member_id: targetFamilyMemberId,
          type: 'medication',
          title: `Tomar ${formData.name}`,
          description: [
            targetName !== 'Eu' ? `Paciente: ${targetName}` : '',
            formData.dosage ? `Dosagem: ${formData.dosage}` : '',
            frequencyText ? `Frequência: ${frequencyText}` : '',
            formData.allow_repurchase_offers ? 'Reposição inteligente habilitada' : '',
          ].filter(Boolean).join(' · '),
          reminder_date: formData.start_date || new Date().toISOString().slice(0, 10),
          reminder_time: formData.reminder_time,
          frequency: normalizeFrequency(frequencyText),
          requires_confirmation: true,
          is_done: false,
          is_active: true,
          metadata: {
            medication_id: data?.id || null,
            ean_code: eanCode || null,
            pharmacy_search_key: pharmacySearchKey || null,
          },
        })
      }

      if (formData.allow_repurchase_offers) {
        await supabase.from('profiles').update({ allow_medication_repurchase_offers: true }).eq('id', user.id)
      }

      setShowAddForm(false)
      setFormData(emptyForm)
      loadData()

      if (formData.notify_calendar && formData.reminder_time) {
        setTimeout(() => openCalendarReminder({ ...data, reminder_time: formData.reminder_time, frequency: frequencyText }), 350)
      }
    } catch (error: any) {
      console.error('Error adding medication:', error)
      alert(error.message || 'Erro ao adicionar medicamento. Confirme se os SQLs de medicamentos/reposição/EAN já foram rodados no Supabase.')
    }
  }

  async function confirmMedication(med: Medication, status: 'taken' | 'delayed' | 'skipped') {
    if (!user) return
    setSavingId(med.id)

    try {
      const now = new Date().toISOString()
      const statusText = status === 'taken' ? 'tomado' : status === 'delayed' ? 'adiado' : 'não tomado'

      await supabase.from('medication_confirmations').insert({
        user_id: user.id,
        medication_id: med.id,
        target_family_member_id: med.target_family_member_id || null,
        status,
        confirmed_by_user_id: user.id,
        confirmed_at: now,
      })

      if (status === 'taken') {
        const nextStock = typeof med.stock_quantity === 'number'
          ? Math.max(0, Number(med.stock_quantity || 0) - Number(med.pills_per_day || 1))
          : null
        await supabase
          .from('medications')
          .update({ last_taken_at: now, ...(nextStock !== null ? { stock_quantity: nextStock } : {}), updated_at: now })
          .eq('id', med.id)
      }

      await createMedicalEvent({
        userId: user.id,
        type: 'medication_confirmation',
        title: `${med.target_name || 'Eu'}: medicamento ${statusText}`,
        description: `${med.name}${med.dosage ? ` · ${med.dosage}` : ''}`,
      })

      loadData()
    } catch (error: any) {
      console.error(error)
      alert(error.message || 'Erro ao confirmar medicamento')
    } finally {
      setSavingId(null)
    }
  }

  async function requestRepurchase(med: Medication) {
    if (!user) return

    if (!med.allow_repurchase_offers) {
      const ok = confirm('Deseja receber opções de reposição/orçamento de farmácias parceiras para este medicamento cadastrado? O HealthWallet não prescreve nem vende diretamente.')
      if (!ok) return
    }

    setRequestingId(med.id)

    try {
      const stockDays = calculateStockDays(med.stock_quantity, med.pills_per_day)
      const productLookup = buildProductLookup(med)
      const consentSnapshot = {
        consent_source: med.allow_repurchase_offers ? 'previous_medication_consent' : 'repurchase_button_confirmation',
        consent_text: 'Usuario solicitou reposicao/orcamento para medicamento previamente cadastrado. HealthWallet nao prescreve nem vende diretamente.',
        medication_id: med.id,
        product_lookup: productLookup,
        timestamp: new Date().toISOString(),
      }

      if (!med.allow_repurchase_offers) {
        await supabase.from('medications').update({ allow_repurchase_offers: true, updated_at: new Date().toISOString() }).eq('id', med.id)
      }
      await supabase.from('profiles').update({ allow_medication_repurchase_offers: true }).eq('id', user.id)

      const { data: request, error } = await supabase
        .from('medication_repurchase_requests')
        .insert({
          user_id: user.id,
          medication_id: med.id,
          target_family_member_id: med.target_family_member_id || null,
          patient_name: med.target_name || 'Eu',
          medication_name: med.name,
          dosage: med.dosage || null,
          frequency: med.frequency || null,
          stock_quantity: med.stock_quantity ?? null,
          estimated_stock_days: typeof stockDays === 'number' ? stockDays : null,
          ean_code: med.ean_code || null,
          active_ingredient: med.active_ingredient || null,
          standardized_dosage: med.standardized_dosage || med.dosage || null,
          pharmaceutical_form: med.pharmaceutical_form || null,
          manufacturer: med.manufacturer || null,
          normalized_product_name: med.normalized_product_name || med.name || null,
          pharmacy_search_key: med.pharmacy_search_key || productLookup.fallback_key || null,
          product_lookup_payload: productLookup,
          preferred_channel: 'partner_quote',
          status: 'requested',
          consent_snapshot: consentSnapshot,
          partner_payload: {
            source: 'healthwallet_app',
            next_step: 'send_to_partner_pharmacy_or_marketplace',
            lookup_strategy: productLookup.lookup_strategy,
            product_lookup: productLookup,
          },
          notes: 'Solicitacao gerada pelo usuario no app HealthWallet.',
        })
        .select()
        .single()

      if (error) throw error

      await supabase.from('medications').update({ last_repurchase_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', med.id)
      await supabase.from('automation_events').insert({
        event_type: 'medication_repurchase_requested',
        source: 'healthwallet_app',
        patient_user_id: user.id,
        payload: {
          repurchase_request_id: request.id,
          medication_id: med.id,
          medication_name: med.name,
          dosage: med.dosage || null,
          estimated_stock_days: typeof stockDays === 'number' ? stockDays : null,
          target_name: med.target_name || 'Eu',
          product_lookup: productLookup,
          consent_snapshot: consentSnapshot,
        },
        status: 'pending',
        priority: productLookup.ean_code ? 4 : 3,
        scheduled_for: new Date().toISOString(),
      })

      await createMedicalEvent({
        userId: user.id,
        type: 'medication_repurchase',
        title: `Reposição solicitada: ${med.name}`,
        description: productLookup.ean_code ? `EAN: ${productLookup.ean_code}` : `Busca: ${productLookup.fallback_key || med.name}`,
      })

      alert('Solicitação registrada. Vamos usar EAN quando houver; se não houver, usamos substância, dosagem e forma para a farmácia parceira localizar o produto.')
      loadData()
    } catch (error: any) {
      console.error('Error requesting repurchase:', error)
      alert(error.message || 'Não foi possível registrar a reposição. Rode os SQLs de reposição/EAN no Supabase e tente novamente.')
    } finally {
      setRequestingId(null)
    }
  }

  async function openIfoodForMedication(med: Medication) {
    if (!user) return
    const searchQuery = buildPharmacySearchQuery({
      name: med.name,
      medication_name: med.name,
      active_ingredient: med.active_ingredient,
      standardized_dosage: med.standardized_dosage || med.dosage,
      pharmaceutical_form: med.pharmaceutical_form,
      normalized_product_name: med.normalized_product_name,
      pharmacy_search_key: med.pharmacy_search_key,
    })

    if (!searchQuery) {
      alert('Inclua nome, substância ou dosagem para buscar no iFood.')
      return
    }

    const destinationUrl = buildIfoodSearchUrl(searchQuery)
    window.open(destinationUrl, '_blank', 'noopener,noreferrer')
    setExternalOpeningId(med.id)

    try {
      await trackExternalPharmacyClick({
        userId: user.id,
        sourceContext: isLowStock(med) ? 'medication_low_stock' : 'medication_card',
        item: med,
        searchQuery,
        destinationUrl,
        medicationId: med.id,
        metadata: {
          stock_days: calculateStockDays(med.stock_quantity, med.pills_per_day),
          has_ean: Boolean(med.ean_code),
        },
      })

      await createMedicalEvent({
        userId: user.id,
        type: 'external_pharmacy_click',
        title: `Busca externa: ${med.name}`,
        description: `iFood: ${searchQuery}. O HealthWallet apenas abriu busca externa, sem vender ou prescrever.`,
      })
    } finally {
      setExternalOpeningId(null)
    }
  }

  async function handleToggleActive(id: string, currentStatus: boolean) {
    await supabase.from('medications').update({ is_active: !currentStatus, updated_at: new Date().toISOString() }).eq('id', id)
    loadData()
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja excluir este medicamento?')) return
    await supabase.from('medications').delete().eq('id', id)
    loadData()
  }

  const activeMeds = medications.filter((m) => m.is_active)
  const inactiveMeds = medications.filter((m) => !m.is_active)
  const lowStockMeds = activeMeds.filter((m) => isLowStock(m))

  return (
    <div className="space-y-5 pb-28">
      <div className="rounded-2xl bg-gradient-to-br from-orange-600 to-amber-700 text-white p-5">
        <div className="flex items-center gap-3">
          <Pill className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Medicamentos</h1>
            <p className="text-white/80 text-sm">Horários, estoque, EAN, substância, recompra, iFood e confirmação Tomei/Adiar/Pulei.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Ativos" value={activeMeds.length} />
        <Stat label="Baixo estoque" value={lowStockMeds.length} />
        <Stat label="Com EAN" value={activeMeds.filter((m) => m.ean_code).length} />
      </div>

      <section className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 space-y-2">
        <p><strong>Controle completo:</strong> cadastre remédio, dose, horários, estoque e quando precisa recomprar.</p>
        <p className="flex gap-2 items-center"><Barcode className="w-4 h-4" /> Para farmácias parceiras, usamos EAN quando houver. Sem EAN, usamos substância + dosagem + forma.</p>
        <p className="flex gap-2 items-center"><Store className="w-4 h-4" /> No MVP, “Ver no iFood” abre busca externa e mede intenção, sem vender diretamente.</p>
      </section>

      {lowStockMeds.length > 0 && (
        <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900 space-y-3">
          <div className="flex items-start gap-3">
            <Package className="mt-0.5 h-5 w-5 text-orange-700" />
            <div>
              <p className="font-bold">Reposição inteligente</p>
              <p>Você tem medicamento perto de acabar. Você pode buscar no iFood ou solicitar cotação com parceiro.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <button onClick={() => openIfoodForMedication(lowStockMeds[0])} disabled={externalOpeningId === lowStockMeds[0].id} className="w-full rounded-xl border border-orange-300 bg-white py-3 font-semibold text-orange-700 disabled:opacity-60">
              {externalOpeningId === lowStockMeds[0].id ? 'Abrindo...' : `Ver ${lowStockMeds[0].name} no iFood`}
            </button>
            <button onClick={() => requestRepurchase(lowStockMeds[0])} disabled={requestingId === lowStockMeds[0].id} className="w-full rounded-xl bg-orange-600 py-3 font-semibold text-white disabled:opacity-60">
              {requestingId === lowStockMeds[0].id ? 'Registrando...' : `Cotar ${lowStockMeds[0].name}`}
            </button>
          </div>
        </section>
      )}

      <button onClick={() => setShowAddForm(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold">
        <Plus className="w-5 h-5" /> Adicionar medicamento
      </button>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
      ) : medications.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-dashed">
          <Pill className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Nenhum medicamento</h3>
          <p className="text-sm text-muted-foreground mb-4">Adicione medicamentos para criar lembretes e acompanhar adesão.</p>
          <button onClick={() => setShowAddForm(true)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Adicionar</button>
        </div>
      ) : (
        <div className="space-y-4">
          {activeMeds.length > 0 && <MedGroup title={`Em uso (${activeMeds.length})`} meds={activeMeds} savingId={savingId} requestingId={requestingId} externalOpeningId={externalOpeningId} onConfirm={confirmMedication} onRepurchase={requestRepurchase} onIfood={openIfoodForMedication} onCalendar={openCalendarReminder} onToggle={handleToggleActive} onDelete={handleDelete} />}
          {inactiveMeds.length > 0 && <MedGroup title={`Inativos (${inactiveMeds.length})`} muted meds={inactiveMeds} savingId={savingId} requestingId={requestingId} externalOpeningId={externalOpeningId} onConfirm={confirmMedication} onRepurchase={requestRepurchase} onIfood={openIfoodForMedication} onCalendar={openCalendarReminder} onToggle={handleToggleActive} onDelete={handleDelete} />}
        </div>
      )}

      {showAddForm && <MedicationForm formData={formData} setFormData={setFormData} familyMembers={familyMembers} onClose={() => setShowAddForm(false)} onSave={handleAddMedication} />}
    </div>
  )
}

function MedicationForm({ formData, setFormData, familyMembers, onClose, onSave }: any) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 px-3 sm:items-center" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-background shadow-2xl">
        <div className="p-4 border-b flex items-center justify-between">
          <div><h2 className="font-bold">Adicionar Medicamento</h2><p className="text-xs text-muted-foreground">EAN, dose, horário, estoque e alertas</p></div>
          <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-muted">✕</button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto pb-6">
          <div>
            <label className="text-sm font-medium mb-1 block">Para quem?</label>
            <select value={formData.target_family_member_id} onChange={(e) => setFormData({ ...formData, target_family_member_id: e.target.value })} className="w-full px-3 py-3 rounded-xl border border-border bg-background">
              <option value="self">Eu</option>
              {familyMembers.map((member: FamilyMember) => <option key={member.id} value={member.id}>{member.name} {member.relationship ? `(${member.relationship})` : ''}</option>)}
            </select>
          </div>

          <Input label="Nome do medicamento *" value={formData.name} onChange={(v: string) => setFormData({ ...formData, name: v })} placeholder="Ex: Losartana" />
          <Input label="Dosagem visível" value={formData.dosage} onChange={(v: string) => setFormData({ ...formData, dosage: v })} placeholder="Ex: 50mg" />

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-3 text-sm text-blue-950">
            <div className="flex items-start gap-2"><Barcode className="mt-0.5 h-4 w-4 text-blue-700" /><div><p className="font-semibold">Mapeamento para farmácia</p><p>Preencha EAN se tiver. Sem EAN, a busca usa substância + dosagem + forma.</p></div></div>
            <Input label="EAN / código de barras" value={formData.ean_code} onChange={(v: string) => setFormData({ ...formData, ean_code: v })} placeholder="13 dígitos, se houver" />
            <Input label="Substância ativa" value={formData.active_ingredient} onChange={(v: string) => setFormData({ ...formData, active_ingredient: v })} placeholder="Ex: losartana potássica" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Dosagem padronizada" value={formData.standardized_dosage} onChange={(v: string) => setFormData({ ...formData, standardized_dosage: v })} placeholder="Ex: 50 mg" />
              <Input label="Forma" value={formData.pharmaceutical_form} onChange={(v: string) => setFormData({ ...formData, pharmaceutical_form: v })} placeholder="Ex: comprimido" />
            </div>
            <Input label="Laboratório/fabricante" value={formData.manufacturer} onChange={(v: string) => setFormData({ ...formData, manufacturer: v })} placeholder="opcional" />
            <Input label="Nome normalizado" value={formData.normalized_product_name} onChange={(v: string) => setFormData({ ...formData, normalized_product_name: v })} placeholder="opcional; se vazio, usa o nome digitado" />
          </div>

          <Input label="Frequência" value={formData.frequency} onChange={(v: string) => setFormData({ ...formData, frequency: v })} placeholder="Ex: 1x ao dia" />
          <Input label="Dias" value={formData.reminder_days} onChange={(v: string) => setFormData({ ...formData, reminder_days: v })} placeholder="Todos os dias, seg/qua/sex..." />

          <div><label className="text-sm font-medium mb-1 block">Horário principal</label><input type="time" value={formData.reminder_time} onChange={(e) => setFormData({ ...formData, reminder_time: e.target.value })} className="w-full px-3 py-3 rounded-xl border border-border bg-background" /><p className="text-xs text-muted-foreground mt-1">Esse horário cria lembrete com confirmação.</p></div>

          <div className="grid grid-cols-2 gap-3">
            <DateInput label="Início" value={formData.start_date} onChange={(v: string) => setFormData({ ...formData, start_date: v })} />
            <DateInput label="Fim" value={formData.end_date} onChange={(v: string) => setFormData({ ...formData, end_date: v })} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <NumberInput label="Estoque" value={formData.stock_quantity} onChange={(v: string) => setFormData({ ...formData, stock_quantity: v })} />
            <NumberInput label="Uso/dia" value={formData.pills_per_day} onChange={(v: string) => setFormData({ ...formData, pills_per_day: v })} />
            <NumberInput label="Recomprar" value={formData.stock_alert_threshold} onChange={(v: string) => setFormData({ ...formData, stock_alert_threshold: v })} />
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Check label="Alertar familiares/cuidadores" checked={formData.notify_caregivers} onChange={(v: boolean) => setFormData({ ...formData, notify_caregivers: v })} />
            <Check label="Medicamento crítico" checked={formData.critical_medication} onChange={(v: boolean) => setFormData({ ...formData, critical_medication: v })} />
          </div>

          <div className="rounded-xl border bg-white p-3 space-y-2">
            <p className="text-sm font-semibold">Canais do lembrete</p>
            <Check label="Push/local no app" checked={formData.notify_push} onChange={(v: boolean) => setFormData({ ...formData, notify_push: v })} />
            <Check label="E-mail via automação/n8n" checked={formData.notify_email} onChange={(v: boolean) => setFormData({ ...formData, notify_email: v })} />
            <Check label="Agenda/alarme do celular" checked={formData.notify_calendar} onChange={(v: boolean) => setFormData({ ...formData, notify_calendar: v })} />
          </div>

          <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 space-y-2 text-sm text-orange-900">
            <div className="flex items-start gap-2"><Shield className="mt-0.5 h-4 w-4 text-orange-700" /><div><p className="font-semibold">Reposição inteligente opcional</p><p>Permita lembretes de recompra e opções de farmácias apenas para medicamentos cadastrados por você.</p></div></div>
            <Check label="Quero receber lembretes de recompra e opções de farmácias parceiras" checked={formData.allow_repurchase_offers} onChange={(v: boolean) => setFormData({ ...formData, allow_repurchase_offers: v })} />
          </div>

          <button onClick={onSave} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold">Salvar medicamento</button>
        </div>
      </div>
    </div>
  )
}

function MedGroup({ title, meds, muted, savingId, requestingId, externalOpeningId, onConfirm, onRepurchase, onIfood, onCalendar, onToggle, onDelete }: any) {
  return <div className={muted ? 'opacity-70' : ''}><h2 className="text-sm font-semibold mb-2">{title}</h2><div className="space-y-2">{meds.map((med: Medication) => <MedicationCard key={med.id} med={med} active={med.is_active} saving={savingId === med.id} requesting={requestingId === med.id} openingExternal={externalOpeningId === med.id} onConfirm={(status: 'taken' | 'delayed' | 'skipped') => onConfirm(med, status)} onRepurchase={() => onRepurchase(med)} onIfood={() => onIfood(med)} onCalendar={() => onCalendar(med)} onToggle={() => onToggle(med.id, med.is_active)} onDelete={() => onDelete(med.id)} />)}</div></div>
}

function MedicationCard({ med, active, saving, requesting, openingExternal, onConfirm, onRepurchase, onIfood, onCalendar, onToggle, onDelete }: any) {
  const stockDays = calculateStockDays(med.stock_quantity, med.pills_per_day)
  const lowStock = isLowStock(med)
  const lookup = buildProductLookup(med)
  const ifoodQuery = buildPharmacySearchQuery({
    name: med.name,
    medication_name: med.name,
    active_ingredient: med.active_ingredient,
    standardized_dosage: med.standardized_dosage || med.dosage,
    pharmaceutical_form: med.pharmaceutical_form,
    normalized_product_name: med.normalized_product_name,
    pharmacy_search_key: med.pharmacy_search_key,
  })

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${active ? 'bg-orange-100' : 'bg-gray-100'}`}><Pill className={`w-5 h-5 ${active ? 'text-orange-600' : 'text-gray-500'}`} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap"><p className="font-semibold">{med.name}</p>{med.critical_medication && <Badge text="Crítico" tone="red" />}{med.allow_repurchase_offers && <Badge text="Reposição" tone="orange" />}{med.ean_code && <Badge text="EAN" tone="blue" />}</div>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Users className="w-3 h-3" />{med.target_name || 'Eu'}</p>
          {med.dosage && <p className="text-sm text-muted-foreground mt-1">{med.dosage}</p>}
          {(med.ean_code || lookup.fallback_key) && <p className="text-xs text-blue-700 mt-1 flex items-center gap-1"><Barcode className="w-3 h-3" /> {med.ean_code ? `EAN ${med.ean_code}` : lookup.fallback_key}</p>}
          {med.frequency && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Clock className="w-3 h-3" /> {med.frequency}</p>}
          {med.reminder_time && <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1"><Bell className="w-3 h-3" /> Lembrete às {String(med.reminder_time).slice(0, 5)}</p>}
          {med.notify_caregivers && <p className="text-xs text-blue-700 mt-1 flex items-center gap-1"><Mail className="w-3 h-3" /> Familiares/cuidadores acompanham este cuidado</p>}
          {typeof stockDays === 'number' && <div className={`mt-3 rounded-lg p-2 text-xs flex items-center gap-2 ${lowStock ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}><Package className="w-4 h-4" />Estoque estimado: {stockDays} dia(s){lowStock ? ' · precisa recomprar em breve' : ''}</div>}
          {med.last_taken_at && <p className="text-xs text-muted-foreground mt-2">Última confirmação: {new Date(med.last_taken_at).toLocaleString('pt-BR')}</p>}
          {med.last_repurchase_requested_at && <p className="text-xs text-orange-700 mt-2">Última solicitação de reposição: {new Date(med.last_repurchase_requested_at).toLocaleDateString('pt-BR')}</p>}

          {active && <div className="grid grid-cols-3 gap-2 mt-3"><button disabled={saving} onClick={() => onConfirm('taken')} className="py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50"><CheckCircle className="w-3 h-3" /> Tomei</button><button disabled={saving} onClick={() => onConfirm('delayed')} className="py-2 rounded-lg bg-amber-100 text-amber-700 text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50"><TimerReset className="w-3 h-3" /> Adiar</button><button disabled={saving} onClick={() => onConfirm('skipped')} className="py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold disabled:opacity-50">Pulei</button></div>}

          <div className="grid grid-cols-1 gap-2 mt-2">
            {med.reminder_time && <button type="button" onClick={onCalendar} className="w-full rounded-lg border border-blue-200 py-2 text-xs font-semibold text-blue-700 flex items-center justify-center gap-1"><Calendar className="w-3 h-3" /> Abrir agenda/alarme</button>}
            {ifoodQuery && <button type="button" onClick={onIfood} disabled={openingExternal} className="w-full rounded-lg border border-red-200 bg-white py-2 text-xs font-semibold text-red-700 flex items-center justify-center gap-1 disabled:opacity-60"><Store className="w-3 h-3" /> {openingExternal ? 'Abrindo...' : 'Ver no iFood'} <ExternalLink className="w-3 h-3" /></button>}
            {active && <button type="button" onClick={onRepurchase} disabled={requesting} className={`w-full rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-60 ${lowStock ? 'bg-orange-600 text-white' : 'border border-orange-200 text-orange-700'}`}><ShoppingCart className="w-3 h-3" /> {requesting ? 'Registrando...' : lowStock ? 'Cotar / solicitar orçamento' : 'Cotar com parceiro'}</button>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2"><button onClick={onToggle} className={`text-xs ${active ? 'text-emerald-600' : 'text-muted-foreground'}`}>{active ? 'Ativo' : 'Reativar'}</button><button onClick={onDelete} className="text-red-500"><Trash2 className="w-4 h-4" /></button></div>
      </div>
    </div>
  )
}

function Stat({ label, value }: any) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className="text-2xl font-bold text-orange-700">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
}

function Badge({ text, tone = 'emerald' }: any) {
  const cls = tone === 'red' ? 'bg-red-100 text-red-700' : tone === 'orange' ? 'bg-orange-100 text-orange-700' : tone === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>{text}</span>
}

function Input({ label, value, onChange, placeholder = '' }: any) {
  return <div><label className="text-sm font-medium mb-1 block">{label}</label><input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-3 rounded-xl border border-border bg-background" /></div>
}

function NumberInput({ label, value, onChange }: any) {
  return <div><label className="text-xs font-medium mb-1 block">{label}</label><input type="number" min="0" value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-3 rounded-xl border border-border bg-background" /></div>
}

function DateInput({ label, value, onChange }: any) {
  return <div><label className="text-sm font-medium mb-1 block">{label}</label><input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-3 rounded-xl border border-border bg-background" /></div>
}

function Check({ label, checked, onChange }: any) {
  return <label className="flex items-center gap-2 text-sm bg-white rounded-lg border p-2"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>
}

function normalizeFrequency(value: string) {
  const text = (value || '').toLowerCase()
  if (text.includes('2x') || text.includes('duas') || text.includes('12')) return 'twice_daily'
  if (text.includes('8 em 8') || text.includes('3x')) return 'three_times_daily'
  if (text.includes('semana')) return 'weekly'
  if (text.includes('mês') || text.includes('mes')) return 'monthly'
  return 'daily'
}

function calculateStockDays(stock: any, pillsPerDay: any) {
  const s = Number(stock)
  const p = Number(pillsPerDay)
  if (!Number.isFinite(s) || !Number.isFinite(p) || p <= 0) return null
  return Math.ceil(s / p)
}

function isLowStock(med: Medication) {
  const stockDays = calculateStockDays(med.stock_quantity, med.pills_per_day)
  if (typeof stockDays !== 'number') return false
  return stockDays <= Number(med.stock_alert_threshold || 5)
}

function normalizeText(value: any) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function buildLocalPharmacySearchKey(input: any) {
  return [input.active_ingredient, input.standardized_dosage, input.pharmaceutical_form, input.manufacturer].map(normalizeText).filter(Boolean).join(' | ') || normalizeText(input.name)
}

function buildProductLookup(med: Medication) {
  const ean = sanitizeEan(med.ean_code)
  const fallbackKey = med.pharmacy_search_key || buildLocalPharmacySearchKey({
    name: med.normalized_product_name || med.name,
    active_ingredient: med.active_ingredient,
    standardized_dosage: med.standardized_dosage || med.dosage,
    pharmaceutical_form: med.pharmaceutical_form,
    manufacturer: med.manufacturer,
  })

  return {
    lookup_strategy: ean ? 'ean' : 'substance_dosage_form',
    ean_code: ean || null,
    medication_name: med.name || null,
    normalized_product_name: med.normalized_product_name || med.name || null,
    active_ingredient: med.active_ingredient || null,
    standardized_dosage: med.standardized_dosage || med.dosage || null,
    pharmaceutical_form: med.pharmaceutical_form || null,
    manufacturer: med.manufacturer || null,
    fallback_key: fallbackKey || null,
  }
}

function openCalendarReminder(med: any) {
  const today = new Date()
  const time = String(med.reminder_time || '09:00').slice(0, 5)
  const [hour, minute] = time.split(':').map(Number)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour || 9, minute || 0)
  const end = new Date(start.getTime() + 15 * 60 * 1000)
  const dates = `${formatCalendarDate(start)}/${formatCalendarDate(end)}`
  const text = encodeURIComponent(`Tomar ${med.name || 'medicamento'}`)
  const details = encodeURIComponent([med.dosage ? `Dosagem: ${med.dosage}` : '', med.frequency ? `Frequência: ${med.frequency}` : '', med.ean_code ? `EAN: ${med.ean_code}` : '', 'Lembrete criado pelo HealthWallet.'].filter(Boolean).join('\n'))
  window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}`)
}

function formatCalendarDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}
