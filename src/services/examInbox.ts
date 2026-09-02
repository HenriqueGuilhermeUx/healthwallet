import { supabase } from '@/lib/supabase'

export type InboundEmailAddress = {
  id: string
  user_id: string
  email_address: string
  local_part: string
  token: string
  domain: string
  status: 'active' | 'paused' | 'revoked'
  forwarding_verified?: boolean
  forwarding_verified_at?: string | null
  last_received_at?: string | null
  created_at?: string
}

export type HealthDocumentInboxItem = {
  id: string
  user_id: string
  inbound_email_id?: string | null
  source?: string
  provider?: string | null
  provider_message_id?: string | null
  from_email?: string | null
  from_name?: string | null
  recipient_email?: string | null
  subject?: string | null
  body_preview?: string | null
  received_at?: string
  status: 'pending_review' | 'approved' | 'rejected' | 'duplicate' | 'processing_error'
  suggested_document_type?: string | null
  suggested_laboratory?: string | null
  storage_bucket?: string | null
  storage_path?: string | null
  file_url?: string | null
  file_name?: string | null
  original_file_name?: string | null
  mime_type?: string | null
  file_size?: number | null
  attachment_sha256?: string | null
  approved_medical_record_id?: string | null
  metadata?: Record<string, any>
  created_at?: string
  updated_at?: string
}

const DEFAULT_DOMAIN = import.meta.env.VITE_HEALTHWALLET_INBOUND_DOMAIN || 'exames.healthwallet.pro'

export async function ensureInboundEmailAddress(userId: string) {
  return supabase.rpc('ensure_health_inbound_email_address', {
    p_user_id: userId,
    p_domain: DEFAULT_DOMAIN,
  })
}

export async function loadInboundEmailAddress(userId: string) {
  const { data, error } = await supabase
    .from('health_inbound_email_addresses')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { data: null, error }
  if (data) return { data: data as InboundEmailAddress, error: null }
  return ensureInboundEmailAddress(userId)
}

export async function loadDocumentInbox(userId: string) {
  return supabase
    .from('health_document_inbox')
    .select('*')
    .eq('user_id', userId)
    .order('received_at', { ascending: false })
    .limit(50)
}

export async function approveInboxDocument(userId: string, item: HealthDocumentInboxItem) {
  if (!item.file_url) throw new Error('Este item não tem anexo para adicionar à carteira.')

  const { data: record, error: recordError } = await supabase
    .from('medical_records')
    .insert({
      user_id: userId,
      file_url: item.file_url,
      file_name: item.original_file_name || item.file_name || item.subject || 'Documento recebido por e-mail',
      exam_type: item.suggested_document_type || 'Documento de saúde',
      exam_date: item.received_at ? String(item.received_at).slice(0, 10) : null,
      laboratory: item.suggested_laboratory || null,
      status: 'pending',
    })
    .select('*')
    .single()

  if (recordError) throw recordError

  const { error: updateError } = await supabase
    .from('health_document_inbox')
    .update({
      status: 'approved',
      approved_medical_record_id: record.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', item.id)
    .eq('user_id', userId)

  if (updateError) throw updateError

  await supabase.from('health_document_inbox_events').insert({
    user_id: userId,
    inbox_item_id: item.id,
    event_type: 'inbox_item_approved',
    actor_user_id: userId,
    actor_role: 'patient',
    description: 'Documento recebido por e-mail aprovado pelo paciente e adicionado à carteira.',
    metadata: {
      medical_record_id: record.id,
      file_name: item.original_file_name || item.file_name,
    },
  }).then(() => null, () => null)

  return record
}

export async function rejectInboxDocument(userId: string, itemId: string, reason = 'rejected_by_patient') {
  const { error } = await supabase
    .from('health_document_inbox')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .eq('user_id', userId)

  if (error) throw error

  await supabase.from('health_document_inbox_events').insert({
    user_id: userId,
    inbox_item_id: itemId,
    event_type: 'inbox_item_rejected',
    actor_user_id: userId,
    actor_role: 'patient',
    description: 'Documento recebido por e-mail recusado pelo paciente.',
  }).then(() => null, () => null)
}

export function extractForwardingCode(item: HealthDocumentInboxItem) {
  const text = `${item.subject || ''} ${item.body_preview || ''}`
  const googleMatch = text.match(/(?:confirmation code|código de confirmação|codigo de confirmacao|verification code|código)[^0-9]{0,40}(\d{6,10})/i)
  if (googleMatch?.[1]) return googleMatch[1]
  const looseMatch = text.match(/\b\d{6,10}\b/)
  return looseMatch?.[0] || null
}

export function isForwardingConfirmation(item: HealthDocumentInboxItem) {
  const text = `${item.from_email || ''} ${item.subject || ''} ${item.body_preview || ''}`.toLowerCase()
  return text.includes('gmail') || text.includes('google') || text.includes('encaminhamento') || text.includes('forwarding') || text.includes('confirmation')
}
