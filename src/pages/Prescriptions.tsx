import { useRef, useState } from 'react'
import {
  AlertCircle,
  Barcode,
  CheckCircle,
  FileText,
  Loader2,
  Pill,
  ShoppingCart,
  Upload,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { createMedicalEvent } from '@/services/medicalTimeline'

const OCR_API_URL = 'https://healthwallet-ocr-api.onrender.com'

type PharmaItem = {
  medication_name?: string
  ean_code?: string | null
  active_ingredient?: string | null
  standardized_dosage?: string | null
  pharmaceutical_form?: string | null
  manufacturer?: string | null
  quantity?: string | null
  instructions?: string | null
  confidence?: number | null
  raw_text?: string | null
}

export default function Prescriptions() {
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [requestingKey, setRequestingKey] = useState<string | null>(null)
  const [record, setRecord] = useState<any>(null)
  const [analysis, setAnalysis] = useState<any>(null)
  const [items, setItems] = useState<PharmaItem[]>([])
  const [error, setError] = useState<string | null>(null)

  function openPicker() {
    if (uploading || processing) return
    fileInputRef.current?.click()
  }

  async function handleFileSelect(file: File) {
    if (!user) return

    const isImage = file.type.startsWith('image/')
    const isPDF = file.type === 'application/pdf'
    if (!isImage && !isPDF) {
      setError('Envie uma receita em PDF, JPG ou PNG.')
      return
    }

    setUploading(true)
    setProcessing(false)
    setError(null)
    setRecord(null)
    setAnalysis(null)
    setItems([])

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}/prescriptions/${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage.from('exams').upload(fileName, file)
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('exams').getPublicUrl(fileName)

      const { data: saved, error: dbError } = await supabase
        .from('medical_records')
        .insert({
          user_id: user.id,
          file_url: publicUrl,
          file_name: file.name,
          exam_type: 'Receita',
          status: 'pending',
        })
        .select()
        .single()

      if (dbError) throw dbError
      setRecord(saved)
      setProcessing(true)

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()

      const response = await fetch(`${OCR_API_URL}/analyze-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId: saved.id,
          userId: user.id,
          fileUrl: publicUrl,
          fileName: file.name,
          documentType: 'prescription',
          extractionHints: {
            documentType: 'prescription',
            pharmaProductMapping: true,
            quoteReady: true,
            preferredFields: [
              'ean_code',
              'medication_name',
              'active_ingredient',
              'standardized_dosage',
              'pharmaceutical_form',
              'manufacturer',
              'quantity',
              'instructions',
            ],
            instruction:
              'Esta imagem/PDF deve ser tratado como receita, prescricao, orientacao terapeutica ou documento farmaceutico. Extraia EAN/GTIN/codigo de barras quando existir. Se nao existir EAN, extraia substancia ativa, dosagem padronizada, forma farmaceutica, fabricante, quantidade e instrucoes. Nao recomende medicamentos novos e nao altere dose.',
          },
          profile: {
            email: user.email,
            ...profile,
          },
        }),
      })

      let payload: any = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }

      if (!response.ok || !payload) {
        payload = {
          summary: 'Receita salva no cofre. A IA ainda não conseguiu interpretar completamente este arquivo.',
          extractedText: payload?.error || `Falha na API OCR. HTTP status: ${response.status}`,
          pharmaItems: [],
        }
      }

      const pharmaItems = extractPharmaItemsFromAnalysis(payload)
      const enriched = {
        ...payload,
        examType: 'Receita',
        pharmaItems,
        pharmacyMapping: {
          status: pharmaItems.length > 0 ? 'quote_ready_candidates' : 'none_found',
          strategy: 'ean_first_then_substance_dosage_form',
          note: 'EAN é preferencial para farmácia parceira. Sem EAN, usar substância + dosagem + forma.',
        },
      }

      await updateMedicalRecord(saved.id, enriched)
      await savePrescriptionMedicationItems(user.id, saved.id, pharmaItems, enriched.extractedText)
      await createMedicalEvent({
        userId: user.id,
        type: 'prescription_uploaded',
        title: 'Receita enviada',
        description: pharmaItems.length > 0
          ? `Receita salva com ${pharmaItems.length} item(ns) para conferência e cotação.`
          : 'Receita salva no cofre de saúde.',
      })

      setAnalysis(enriched)
      setItems(pharmaItems)
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar receita')
    } finally {
      setUploading(false)
      setProcessing(false)
    }
  }

  async function updateMedicalRecord(recordId: string, payload: any) {
    const updates = {
      status: 'processed',
      exam_type: 'Receita',
      ai_analysis: payload.summary || '',
      ai_result: payload,
      extracted_text: payload.extractedText || null,
      extracted_pharma_items: payload.pharmaItems || [],
      analyzed_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('medical_records').update(updates).eq('id', recordId)
    if (!error) return

    const message = String(error.message || '').toLowerCase()
    if (!message.includes('extracted_pharma_items')) throw error

    const { extracted_pharma_items, ...fallback } = updates
    await supabase.from('medical_records').update(fallback).eq('id', recordId)
  }

  async function savePrescriptionMedicationItems(userId: string, recordId: string, pharmaItems: PharmaItem[], rawText?: string) {
    if (!pharmaItems.length) return

    try {
      await supabase.from('prescription_medication_items').insert(
        pharmaItems.map((item) => ({
          user_id: userId,
          medical_record_id: recordId,
          source_type: 'ocr_document',
          medication_name: item.medication_name || item.active_ingredient || 'Medicamento identificado',
          ean_code: sanitizeEan(item.ean_code) || null,
          active_ingredient: item.active_ingredient || null,
          standardized_dosage: item.standardized_dosage || null,
          pharmaceutical_form: item.pharmaceutical_form || null,
          manufacturer: item.manufacturer || null,
          quantity: item.quantity || null,
          instructions: item.instructions || null,
          confidence: item.confidence || null,
          mapping_status: item.ean_code ? 'mapped_by_ean' : item.active_ingredient ? 'mapped_by_substance' : 'extracted',
          raw_text: item.raw_text || rawText || null,
          metadata: {
            source: 'healthwallet_prescription_upload',
            lookup_strategy: item.ean_code ? 'ean' : 'substance_dosage_form',
          },
        }))
      )
    } catch (error) {
      console.warn('Prescription items not saved yet. Run SQL_HEALTHWALLET_EAN_FARMACIA_V1.sql.', error)
    }
  }

  async function requestQuote(item: PharmaItem, index: number) {
    if (!user) return

    const ok = confirm('Solicitar cotação com farmácia parceira para este item da receita? O HealthWallet não vende, não prescreve e não altera medicamentos.')
    if (!ok) return

    const key = `${index}-${item.ean_code || item.medication_name || item.active_ingredient}`
    setRequestingKey(key)

    try {
      const lookup = buildProductLookup(item)
      const consentSnapshot = {
        consent_source: 'prescription_quote_button',
        consent_text: 'Usuario solicitou cotacao de compra/reposicao para item de receita enviada por ele. HealthWallet nao prescreve nem vende diretamente.',
        medical_record_id: record?.id || null,
        product_lookup: lookup,
        timestamp: new Date().toISOString(),
      }

      const { data: request, error: requestError } = await supabase
        .from('medication_repurchase_requests')
        .insert({
          user_id: user.id,
          medication_id: null,
          patient_name: 'Eu',
          medication_name: item.medication_name || item.active_ingredient || 'Medicamento da receita',
          dosage: item.standardized_dosage || null,
          frequency: item.instructions || null,
          ean_code: lookup.ean_code || null,
          active_ingredient: item.active_ingredient || null,
          standardized_dosage: item.standardized_dosage || null,
          pharmaceutical_form: item.pharmaceutical_form || null,
          manufacturer: item.manufacturer || null,
          normalized_product_name: item.medication_name || item.active_ingredient || null,
          pharmacy_search_key: lookup.fallback_key || null,
          product_lookup_payload: lookup,
          preferred_channel: 'partner_quote',
          status: 'requested',
          consent_snapshot: consentSnapshot,
          partner_payload: {
            source: 'healthwallet_prescription_upload',
            next_step: 'send_to_partner_pharmacy_or_marketplace',
            lookup_strategy: lookup.lookup_strategy,
            product_lookup: lookup,
          },
          notes: 'Cotacao solicitada pelo usuario a partir de receita enviada ao HealthWallet.',
        })
        .select()
        .single()

      if (requestError) throw requestError

      await supabase.from('automation_events').insert({
        event_type: 'medication_repurchase_requested',
        source: 'healthwallet_app',
        patient_user_id: user.id,
        payload: {
          repurchase_request_id: request.id,
          medical_record_id: record?.id || null,
          source: 'prescription_upload',
          medication_name: item.medication_name || item.active_ingredient || null,
          product_lookup: lookup,
          ean_code: lookup.ean_code || null,
          active_ingredient: item.active_ingredient || null,
          standardized_dosage: item.standardized_dosage || null,
          pharmaceutical_form: item.pharmaceutical_form || null,
          manufacturer: item.manufacturer || null,
          pharmacy_search_key: lookup.fallback_key || null,
          consent_snapshot: consentSnapshot,
        },
        status: 'pending',
        priority: lookup.ean_code ? 4 : 3,
        scheduled_for: new Date().toISOString(),
      })

      await createMedicalEvent({
        userId: user.id,
        type: 'medication_repurchase',
        title: `Cotação solicitada: ${item.medication_name || item.active_ingredient || 'Receita'}`,
        description: lookup.ean_code ? `EAN: ${lookup.ean_code}` : `Busca: ${lookup.fallback_key}`,
      })

      alert('Cotação registrada. Quando conectarmos o parceiro, ele receberá EAN ou substância/dosagem/forma para localizar o produto.')
    } catch (err: any) {
      alert(err.message || 'Não foi possível registrar a cotação. Rode os SQLs de reposição/EAN no Supabase.')
    } finally {
      setRequestingKey(null)
    }
  }

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-2xl bg-gradient-to-br from-blue-700 to-indigo-800 p-5 text-white">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8" />
          <div>
            <h1 className="text-2xl font-bold">Receitas</h1>
            <p className="text-sm text-white/80">Envie receita, salve no cofre e prepare cotação com farmácia parceira.</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 space-y-2">
        <p><strong>Como funciona:</strong> a IA tenta identificar EAN/código de barras. Sem EAN, monta uma busca por substância + dosagem + forma.</p>
        <p>Você decide se quer cotar. O HealthWallet não vende, não prescreve e não altera a receita.</p>
      </section>

      <div onClick={openPicker} className="cursor-pointer rounded-2xl border-2 border-dashed border-border p-8 text-center hover:border-blue-500 hover:bg-muted/40">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
        />
        {uploading || processing ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
            <p className="text-sm text-muted-foreground">{uploading ? 'Enviando receita...' : 'Analisando com IA...'}</p>
          </div>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100">
              <Upload className="h-8 w-8 text-blue-700" />
            </div>
            <p className="font-semibold">Enviar receita</p>
            <p className="text-sm text-muted-foreground">PDF, JPG ou PNG. Pode ser foto da receita.</p>
          </>
        )}
      </div>

      <button onClick={openPicker} disabled={uploading || processing} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 font-semibold text-white disabled:opacity-60">
        <Upload className="h-5 w-5" /> Enviar receita para análise
      </button>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {record && !error && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">Receita salva no cofre: {record.file_name}</p>
        </div>
      )}

      {analysis?.summary && (
        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-bold">Resumo da IA</h2>
          <p className="mt-2 text-sm text-muted-foreground">{analysis.summary}</p>
        </section>
      )}

      {items.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-bold">Itens encontrados para conferência</h2>
          {items.map((item, index) => {
            const lookup = buildProductLookup(item)
            const key = `${index}-${item.ean_code || item.medication_name || item.active_ingredient}`
            return (
              <div key={key} className="rounded-xl border bg-white p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                    <Pill className="h-5 w-5 text-blue-700" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{item.medication_name || item.active_ingredient || 'Medicamento identificado'}</p>
                    <p className="text-xs text-muted-foreground">{[item.standardized_dosage, item.pharmaceutical_form, item.manufacturer].filter(Boolean).join(' · ') || 'Dados incompletos'}</p>
                    {item.instructions && <p className="mt-1 text-xs text-gray-600">{item.instructions}</p>}
                    <p className="mt-2 flex items-center gap-1 text-xs text-blue-700">
                      <Barcode className="h-3 w-3" />
                      {lookup.ean_code ? `EAN ${lookup.ean_code}` : `Busca: ${lookup.fallback_key || 'precisa conferência'}`}
                    </p>
                  </div>
                </div>
                <button onClick={() => requestQuote(item, index)} disabled={requestingKey === key} className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 py-3 text-sm font-semibold text-white disabled:opacity-60">
                  {requestingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                  Cotar com farmácia parceira
                </button>
              </div>
            )
          })}
        </section>
      ) : analysis ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Não identifiquei medicamentos com segurança. A receita ficou salva no cofre; tente uma foto mais nítida ou confira manualmente com um profissional.
        </section>
      ) : null}
    </div>
  )
}

function extractPharmaItemsFromAnalysis(analysis: any): PharmaItem[] {
  const direct = analysis?.pharmaItems || analysis?.prescriptionMedicationItems || analysis?.prescription_items || analysis?.medications
  const candidates = Array.isArray(direct) ? direct : []
  const normalized = candidates.map(normalizeItem).filter((item: PharmaItem) => item.medication_name || item.ean_code || item.active_ingredient)

  if (normalized.length > 0) return normalized

  const text = String(analysis?.extractedText || analysis?.rawText || '')
  const eans = Array.from(new Set((text.match(/\b\d{8,14}\b/g) || []).map(sanitizeEan).filter(Boolean)))
  return eans.map((ean) => ({
    medication_name: 'Produto identificado por código de barras',
    ean_code: ean,
    raw_text: text.slice(0, 500),
    confidence: 0.45,
  }))
}

function normalizeItem(item: any): PharmaItem {
  const name = item.medication_name || item.name || item.product_name || item.drugName || item.nome || item.medicamento
  const dosage = item.standardized_dosage || item.dosage || item.dose || item.concentration || item.concentracao
  return {
    medication_name: normalizeText(name),
    ean_code: sanitizeEan(item.ean_code || item.ean || item.gtin || item.barcode || item.codigo_barras),
    active_ingredient: normalizeText(item.active_ingredient || item.substance || item.substancia || item.principio_ativo),
    standardized_dosage: normalizeText(dosage),
    pharmaceutical_form: normalizeText(item.pharmaceutical_form || item.form || item.forma || item.forma_farmaceutica),
    manufacturer: normalizeText(item.manufacturer || item.laboratory || item.laboratorio || item.fabricante),
    quantity: normalizeText(item.quantity || item.quantidade),
    instructions: normalizeText(item.instructions || item.posology || item.posologia || item.orientacoes),
    confidence: Number(item.confidence || item.confidence_score || 0) || null,
    raw_text: normalizeText(item.raw_text || item.rawText),
  }
}

function sanitizeEan(value: any) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.length >= 8 && digits.length <= 14 ? digits : ''
}

function normalizeText(value: any) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function buildProductLookup(item: PharmaItem) {
  const ean = sanitizeEan(item.ean_code)
  const fallbackKey = [
    item.active_ingredient || item.medication_name,
    item.standardized_dosage,
    item.pharmaceutical_form,
    item.manufacturer,
  ].map(normalizeText).filter(Boolean).join(' | ')

  return {
    lookup_strategy: ean ? 'ean' : 'substance_dosage_form',
    ean_code: ean || null,
    medication_name: item.medication_name || null,
    active_ingredient: item.active_ingredient || null,
    standardized_dosage: item.standardized_dosage || null,
    pharmaceutical_form: item.pharmaceutical_form || null,
    manufacturer: item.manufacturer || null,
    fallback_key: fallbackKey || null,
  }
}
