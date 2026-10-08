import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

export async function handler(event) {
  if (event.httpMethod === 'GET') {
    return verifyWebhook(event)
  }

  if (event.httpMethod !== 'POST') {
    return reply(405, { error: 'method_not_allowed' })
  }

  const rawBody = event.body || ''
  if (!verifyMetaSignature(rawBody, event.headers || {})) {
    return reply(401, { error: 'invalid_webhook_signature' })
  }

  // Acknowledge quickly on payloads without messages (delivery/read statuses).
  let payload
  try {
    payload = JSON.parse(rawBody || '{}')
  } catch {
    return reply(400, { error: 'invalid_json' })
  }

  const messages = extractMessages(payload)
  if (!messages.length) return reply(200, { ok: true, ignored: true })

  try {
    const cfg = config()
    const admin = createClient(cfg.supabaseUrl, cfg.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    for (const item of messages.slice(0, 10)) {
      await processMessage({ admin, cfg, item })
    }

    return reply(200, { ok: true })
  } catch (error) {
    console.error('WhatsApp Concierge webhook error:', error)
    // Meta retries non-2xx. Returning 200 prevents duplicate user-facing messages;
    // failed items remain visible in logs/intake and can be replayed manually.
    return reply(200, { ok: false, accepted: true })
  }
}

function verifyWebhook(event) {
  const q = event.queryStringParameters || {}
  const verifyToken = String(process.env.WHATSAPP_VERIFY_TOKEN || '')
  if (
    q['hub.mode'] === 'subscribe'
    && verifyToken
    && safeEqual(String(q['hub.verify_token'] || ''), verifyToken)
  ) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain' },
      body: String(q['hub.challenge'] || ''),
    }
  }
  return reply(403, { error: 'verification_failed' })
}

function verifyMetaSignature(rawBody, headers) {
  const secret = String(process.env.WHATSAPP_APP_SECRET || '')
  if (!secret) return process.env.WHATSAPP_ALLOW_UNSIGNED_WEBHOOK === 'true'

  const supplied = String(
    headers['x-hub-signature-256']
    || headers['X-Hub-Signature-256']
    || '',
  )
  if (!supplied.startsWith('sha256=')) return false

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')

  return safeEqual(supplied, expected)
}

function extractMessages(payload) {
  const out = []
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {}
      const phoneNumberId = value?.metadata?.phone_number_id || null
      const contactMap = new Map(
        (value?.contacts || []).map((c) => [String(c?.wa_id || ''), c]),
      )

      for (const message of value?.messages || []) {
        const from = normalizePhone(message?.from)
        if (!from || !message?.id) continue
        out.push({
          message,
          from,
          phoneNumberId,
          contact: contactMap.get(String(message?.from || '')) || null,
        })
      }
    }
  }
  return out
}

async function processMessage({ admin, cfg, item }) {
  const { message, from } = item

  if (message.type === 'text') {
    const text = String(message?.text?.body || '').trim()
    const linkMatch = text.match(/^VINCULAR\s+([A-Z0-9]{6})$/i)
    if (linkMatch) {
      await handleLinkCode({ admin, cfg, from, code: linkMatch[1], messageId: message.id })
      return
    }
  }

  const { data: identity } = await admin
    .from('concierge_channel_identities')
    .select('patient_id,active,verified_at,metadata')
    .eq('channel', 'whatsapp')
    .eq('external_address', from)
    .eq('active', true)
    .maybeSingle()

  if (!identity?.patient_id) {
    await sendWhatsAppText(
      cfg,
      from,
      'Para usar o MyDataMed Concierge por aqui, vincule este número na HealthWallet. Abra Concierge Digital > Conectar WhatsApp e envie o código exibido no app.',
    )
    return
  }

  const patientId = identity.patient_id

  const { data: membership } = await admin
    .from('concierge_memberships')
    .select('status,plan_code,consent_status')
    .eq('patient_id', patientId)
    .maybeSingle()

  const active =
    membership
    && ['pilot', 'active'].includes(membership.status)
    && membership.consent_status === 'accepted'
    && String(membership.plan_code || '').startsWith('concierge')

  if (!active) {
    await sendWhatsAppText(
      cfg,
      from,
      'Seu número está vinculado à HealthWallet, mas o Concierge Digital não está ativo neste plano. Abra o app para ver o upgrade Concierge.',
    )
    return
  }

  const { data: duplicate } = await admin
    .from('concierge_chat_messages')
    .select('id')
    .contains('metadata', { whatsapp_message_id: message.id })
    .limit(1)
    .maybeSingle()

  if (duplicate) return

  const { data: latestSession } = await admin
    .from('concierge_chat_sessions')
    .select('id,status,metadata')
    .eq('patient_id', patientId)
    .eq('channel', 'whatsapp')
    .neq('status', 'closed')
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let normalizedText = ''
  let source = 'whatsapp'
  let intake = null

  if (message.type === 'text') {
    normalizedText = String(message?.text?.body || '').trim()
  } else if (message.type === 'audio') {
    const media = await downloadMetaMedia(cfg, message?.audio?.id)
    normalizedText = await transcribeAudio(cfg, media.bytes, media.mimeType)
    if (!normalizedText) {
      await sendWhatsAppText(cfg, from, 'Não consegui transcrever esse áudio. Pode tentar novamente ou escrever a mensagem?')
      return
    }
  } else if (message.type === 'image' || message.type === 'document') {
    intake = await ingestDocument({
      admin,
      cfg,
      patientId,
      sessionId: latestSession?.id || null,
      message,
      from,
    })

    normalizedText = buildDocumentMessage(intake)
    source = message.type === 'image' ? 'image' : 'document'
  } else {
    await sendWhatsAppText(
      cfg,
      from,
      'Por enquanto consigo receber texto, áudio, fotos de pedidos/recibos e documentos. Se preferir, escreva o que você precisa resolver.',
    )
    return
  }

  if (!normalizedText) return

  const agentResult = await invokeConciergeAgent(cfg, {
    patientId,
    sessionId: latestSession?.id || null,
    message: normalizedText,
    source,
    channel: 'whatsapp',
  })

  if (!agentResult.ok) {
    if (agentResult.error === 'concierge_subscription_required') {
      await sendWhatsAppText(cfg, from, 'Seu Concierge Digital não está ativo neste momento. Abra a HealthWallet para verificar seu plano.')
      return
    }
    throw new Error(agentResult.error || 'concierge_agent_failed')
  }

  const sessionId = agentResult.sessionId || latestSession?.id || null

  if (sessionId) {
    const { data: latestPatientMessage } = await admin
      .from('concierge_chat_messages')
      .select('id,metadata')
      .eq('session_id', sessionId)
      .eq('patient_id', patientId)
      .eq('actor_role', 'patient')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestPatientMessage?.id) {
      await admin
        .from('concierge_chat_messages')
        .update({
          metadata: {
            ...(latestPatientMessage.metadata || {}),
            whatsapp_message_id: message.id,
            whatsapp_from: from,
            intake_id: intake?.id || null,
          },
        })
        .eq('id', latestPatientMessage.id)
    }
  }

  if (intake?.id && agentResult.createdOperationalCase?.id) {
    await admin
      .from('concierge_document_intake')
      .update({
        case_id: agentResult.createdOperationalCase.id,
        status: 'linked',
      })
      .eq('id', intake.id)
  }

  if (agentResult.reply) {
    await sendWhatsAppText(cfg, from, agentResult.reply)
  }
}

async function handleLinkCode({ admin, cfg, from, code, messageId }) {
  const codeHash = crypto.createHash('sha256').update(String(code).toUpperCase()).digest('hex')
  const { data: challenge } = await admin
    .from('concierge_channel_link_challenges')
    .select('id,patient_id,expires_at,used_at')
    .eq('channel', 'whatsapp')
    .eq('code_hash', codeHash)
    .maybeSingle()

  if (!challenge || challenge.used_at || new Date(challenge.expires_at).getTime() < Date.now()) {
    await sendWhatsAppText(cfg, from, 'Esse código de vinculação é inválido ou expirou. Gere um novo código na HealthWallet.')
    return
  }

  const { data: existing } = await admin
    .from('concierge_channel_identities')
    .select('id,patient_id')
    .eq('channel', 'whatsapp')
    .eq('external_address', from)
    .maybeSingle()

  if (existing && existing.patient_id !== challenge.patient_id) {
    await sendWhatsAppText(cfg, from, 'Este número já está vinculado a outra conta. Fale com a equipe Concierge para revisar o vínculo.')
    return
  }

  if (existing) {
    await admin
      .from('concierge_channel_identities')
      .update({
        patient_id: challenge.patient_id,
        verified_at: new Date().toISOString(),
        consent_at: new Date().toISOString(),
        active: true,
        metadata: { linked_via: 'inbound_code', last_link_message_id: messageId },
      })
      .eq('id', existing.id)
  } else {
    await admin
      .from('concierge_channel_identities')
      .insert({
        patient_id: challenge.patient_id,
        channel: 'whatsapp',
        external_address: from,
        verified_at: new Date().toISOString(),
        consent_at: new Date().toISOString(),
        active: true,
        metadata: { linked_via: 'inbound_code', link_message_id: messageId },
      })
  }

  await admin
    .from('concierge_channel_link_challenges')
    .update({ used_at: new Date().toISOString() })
    .eq('id', challenge.id)

  await sendWhatsAppText(
    cfg,
    from,
    'Pronto — este WhatsApp foi conectado ao seu MyDataMed Concierge. Você já pode falar comigo por texto ou áudio e enviar pedidos, notas e documentos.',
  )
}

async function ingestDocument({ admin, cfg, patientId, sessionId, message }) {
  const mediaId = message.type === 'image' ? message?.image?.id : message?.document?.id
  const filename = sanitizeFilename(
    message.type === 'document'
      ? message?.document?.filename || `documento-${message.id}`
      : `imagem-${message.id}.jpg`,
  )

  const media = await downloadMetaMedia(cfg, mediaId)
  const now = new Date()
  const path = [
    patientId,
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    `${message.id}-${filename}`,
  ].join('/')

  const upload = await admin.storage
    .from('concierge-intake')
    .upload(path, media.bytes, {
      contentType: media.mimeType || 'application/octet-stream',
      upsert: false,
    })

  if (upload.error && !String(upload.error.message || '').toLowerCase().includes('already exists')) {
    throw upload.error
  }

  const baseRow = {
    patient_id: patientId,
    chat_session_id: sessionId,
    channel: 'whatsapp',
    source_message_id: message.id,
    storage_bucket: 'concierge-intake',
    storage_path: path,
    mime_type: media.mimeType || null,
    original_filename: filename,
    status: 'processing',
    metadata: {
      media_id: mediaId,
      whatsapp_type: message.type,
    },
  }

  const { data: existingIntake } = await admin
    .from('concierge_document_intake')
    .select('*')
    .eq('channel', 'whatsapp')
    .eq('source_message_id', message.id)
    .maybeSingle()

  if (existingIntake) return existingIntake

  const { data: inserted, error: insertError } = await admin
    .from('concierge_document_intake')
    .insert(baseRow)
    .select('*')
    .single()

  if (insertError) throw insertError

  let extraction = null
  if (String(media.mimeType || '').startsWith('image/') && cfg.openaiKey) {
    extraction = await extractHealthAdminDocument(cfg, media.bytes, media.mimeType)
  }

  const status = extraction ? (extraction.confidence >= 0.7 ? 'classified' : 'needs_review') : 'needs_review'
  const { data: updated } = await admin
    .from('concierge_document_intake')
    .update({
      status,
      document_type: extraction?.document_type || null,
      extracted_fields: extraction?.fields || {},
      extraction_confidence: extraction?.confidence ?? null,
      metadata: {
        ...(inserted?.metadata || baseRow.metadata),
        extraction_summary: extraction?.summary || null,
        requires_human_review: status === 'needs_review',
      },
    })
    .eq('id', inserted.id)
    .select('*')
    .single()

  return updated || inserted
}

async function extractHealthAdminDocument(cfg, bytes, mimeType) {
  const base64 = Buffer.from(bytes).toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`

  const prompt = `Classifique este documento recebido pelo Concierge de Saúde.
Extraia SOMENTE dados administrativos visíveis. Não diagnostique e não infira informação clínica ausente.

Retorne somente JSON:
{
  "document_type": "medical_order|medical_report|insurance_card|receipt_invoice|proof_of_payment|authorization|denial|reimbursement_form|other",
  "confidence": 0.0,
  "summary": "resumo administrativo curto",
  "fields": {
    "patient_name": null,
    "provider_name": null,
    "doctor_name": null,
    "professional_registration": null,
    "document_date": null,
    "procedure_name": null,
    "tuss_codes": [],
    "amount": null,
    "currency": "BRL",
    "insurer_name": null,
    "member_number": null,
    "authorization_number": null,
    "denial_reason": null
  }
}`

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.CONCIERGE_OCR_MODEL || process.env.CONCIERGE_AI_MODEL || 'gpt-6-luna',
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          { type: 'input_image', image_url: dataUrl },
        ],
      }],
    }),
  })

  const json = await response.json()
  if (!response.ok) {
    console.warn('Document extraction failed:', json?.error?.message || response.status)
    return null
  }

  return parseJsonObject(json.output_text)
}

async function transcribeAudio(cfg, bytes, mimeType) {
  if (!cfg.openaiKey) return ''

  const form = new FormData()
  form.append('model', process.env.CONCIERGE_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe')
  form.append('language', 'pt')
  form.append('file', new Blob([bytes], { type: mimeType || 'audio/ogg' }), 'audio.ogg')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.openaiKey}` },
    body: form,
  })

  const json = await response.json()
  if (!response.ok) throw new Error(json?.error?.message || 'audio_transcription_failed')
  return String(json?.text || '').trim()
}

async function downloadMetaMedia(cfg, mediaId) {
  if (!mediaId) throw new Error('media_id_missing')

  const metaResponse = await fetch(
    `https://graph.facebook.com/${cfg.graphVersion}/${encodeURIComponent(mediaId)}`,
    { headers: { Authorization: `Bearer ${cfg.accessToken}` } },
  )
  const meta = await metaResponse.json()
  if (!metaResponse.ok || !meta?.url) throw new Error(meta?.error?.message || 'media_metadata_failed')

  const mediaResponse = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${cfg.accessToken}` },
  })
  if (!mediaResponse.ok) throw new Error('media_download_failed')

  return {
    bytes: new Uint8Array(await mediaResponse.arrayBuffer()),
    mimeType: meta?.mime_type || mediaResponse.headers.get('content-type') || 'application/octet-stream',
  }
}

async function invokeConciergeAgent(cfg, body) {
  const response = await fetch(`${cfg.siteUrl}/.netlify/functions/concierge-digital-ai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Concierge-Internal-Key': cfg.internalKey,
    },
    body: JSON.stringify(body),
  })

  const json = await response.json().catch(() => ({}))
  return {
    ok: response.ok,
    ...json,
  }
}

async function sendWhatsAppText(cfg, to, body) {
  if (!cfg.accessToken || !cfg.phoneNumberId) return false

  const response = await fetch(
    `https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: {
          preview_url: false,
          body: String(body || '').slice(0, 4000),
        },
      }),
    },
  )

  if (!response.ok) {
    const error = await response.text()
    console.error('WhatsApp send failed:', response.status, error.slice(0, 500))
    return false
  }
  return true
}

function buildDocumentMessage(intake) {
  const fields = intake?.extracted_fields || {}
  const summary = intake?.metadata?.extraction_summary || 'Documento recebido para revisão.'
  return [
    'Enviei um documento pelo WhatsApp para o Concierge.',
    `Tipo identificado: ${intake?.document_type || 'a confirmar'}.`,
    `Resumo administrativo: ${summary}`,
    fields.insurer_name ? `Operadora: ${fields.insurer_name}.` : '',
    fields.procedure_name ? `Procedimento: ${fields.procedure_name}.` : '',
    fields.amount != null ? `Valor: R$ ${fields.amount}.` : '',
    fields.denial_reason ? `Motivo informado de negativa: ${fields.denial_reason}.` : '',
    'Use esses dados apenas para organizar o fluxo administrativo e confirme com humano se a extração estiver incerta.',
  ].filter(Boolean).join('\n')
}

function parseJsonObject(raw) {
  const text = String(raw || '').trim().replace(/^\`\`\`json\s*/i, '').replace(/\`\`\`$/i, '').trim()
  try {
    const parsed = JSON.parse(text)
    return {
      document_type: String(parsed.document_type || 'other'),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0))),
      summary: String(parsed.summary || '').slice(0, 1000),
      fields: parsed.fields && typeof parsed.fields === 'object' ? parsed.fields : {},
    }
  } catch {
    return null
  }
}

function config() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const siteUrl = String(process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '')
  const internalKey = process.env.CONCIERGE_INTERNAL_SERVICE_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  if (!supabaseUrl || !serviceKey || !siteUrl || !internalKey) {
    throw new Error('whatsapp_concierge_server_not_configured')
  }

  return {
    supabaseUrl,
    serviceKey,
    accessToken: String(accessToken || ''),
    phoneNumberId: String(phoneNumberId || ''),
    graphVersion: String(process.env.WHATSAPP_GRAPH_VERSION || 'v25.0'),
    siteUrl,
    internalKey,
    openaiKey: String(openaiKey || ''),
  }
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function sanitizeFilename(value) {
  const cleaned = String(value || 'documento')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120)
  return cleaned || 'documento'
}

function safeEqual(a, b) {
  if (!a || !b) return false
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

function reply(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  }
}
