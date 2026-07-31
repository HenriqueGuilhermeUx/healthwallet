import { supabase } from '@/lib/supabase'

type PharmacyItem = {
  id?: string | null
  medication_id?: string | null
  medical_record_id?: string | null
  appointment_id?: string | null
  name?: string | null
  medication_name?: string | null
  ean_code?: string | null
  active_ingredient?: string | null
  standardized_dosage?: string | null
  dosage?: string | null
  pharmaceutical_form?: string | null
  manufacturer?: string | null
  normalized_product_name?: string | null
  pharmacy_search_key?: string | null
  source?: string | null
}

type TrackParams = {
  userId: string
  provider?: 'ifood_search' | 'partner_pharmacy' | 'other'
  sourceContext: 'medication_low_stock' | 'medication_card' | 'teleconsultation_prescription' | 'uploaded_prescription' | 'manual'
  item: PharmacyItem
  searchQuery: string
  destinationUrl: string
  medicationId?: string | null
  medicalRecordId?: string | null
  appointmentId?: string | null
  metadata?: Record<string, any>
}

export function normalizeText(value: any) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

export function sanitizeEan(value: any) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.length >= 8 && digits.length <= 14 ? digits : ''
}

export function buildPharmacySearchQuery(item: PharmacyItem) {
  const query = [
    item.active_ingredient || item.normalized_product_name || item.medication_name || item.name,
    item.standardized_dosage || item.dosage,
    item.pharmaceutical_form,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ')

  return query || normalizeText(item.pharmacy_search_key)
}

export function buildIfoodSearchUrl(searchQuery: string) {
  return `https://www.ifood.com.br/busca?q=${encodeURIComponent(searchQuery)}`
}

export async function trackExternalPharmacyClick(params: TrackParams) {
  const item = params.item || {}

  try {
    await supabase.from('external_pharmacy_clicks').insert({
      user_id: params.userId,
      provider: params.provider || 'ifood_search',
      source_context: params.sourceContext,
      medication_id: params.medicationId || item.medication_id || null,
      medical_record_id: params.medicalRecordId || item.medical_record_id || null,
      appointment_id: params.appointmentId || item.appointment_id || null,
      medication_name: item.medication_name || item.name || item.normalized_product_name || null,
      ean_code: sanitizeEan(item.ean_code) || null,
      active_ingredient: item.active_ingredient || null,
      standardized_dosage: item.standardized_dosage || item.dosage || null,
      pharmaceutical_form: item.pharmaceutical_form || null,
      manufacturer: item.manufacturer || null,
      search_query: params.searchQuery,
      destination_url: params.destinationUrl,
      metadata: {
        source_item_id: item.id || null,
        no_diagnosis: true,
        no_clinical_inference: true,
        external_redirect_only: true,
        ...(params.metadata || {}),
      },
    })
  } catch (error) {
    console.warn('External pharmacy click not tracked yet. Run SQL_HEALTHWALLET_FARMACIA_REDIRECT_V1.sql.', error)
  }
}
