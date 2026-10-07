import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' })

  const supplied = String(event.headers?.['x-concierge-internal-key'] || event.headers?.['X-Concierge-Internal-Key'] || '')
  const expected = String(process.env.CONCIERGE_INTERNAL_SERVICE_KEY || '')
  if (!safeEqual(supplied, expected)) return json(401, { error: 'invalid_internal_key' })

  try {
    const body = JSON.parse(event.body || '{}')
    const sessionId = String(body.sessionId || '')
    const actorUserId = String(body.actorUserId || '')
    const actorRole = String(body.actorRole || 'concierge')
    const content = String(body.content || '').trim().slice(0, 4000)

    if (!sessionId || !actorUserId || !content) {
      return json(400, { error: 'session_actor_content_required' })
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) return json(503, { error: 'server_not_configured' })

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: session, error: sessionError } = await admin
      .from('concierge_chat_sessions')
      .select('id,patient_id,status,channel,assigned_staff_id')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) return json(404, { error: 'session_not_found' })

    if (session.status !== 'human_active' || session.assigned_staff_id !== actorUserId) {
      return json(409, { error: 'session_not_owned_by_actor' })
    }

    const safeRoles = new Set(['concierge','nurse','doctor','care_coordinator','admin'])
    const safeRole = safeRoles.has(actorRole) ? actorRole : 'concierge'

    const { data: message, error: insertError } = await admin
      .from('concierge_chat_messages')
      .insert({
        session_id: session.id,
        patient_id: session.patient_id,
        actor_user_id: actorUserId,
        actor_role: safeRole,
        source: session.channel === 'whatsapp' ? 'whatsapp' : 'text',
        visibility: 'patient',
        content,
        metadata: {
          source: 'mydatamed_live_console',
          outbound_channel: session.channel,
        },
      })
      .select('id,created_at')
      .single()

    if (insertError) throw insertError

    await admin
      .from('concierge_chat_sessions')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', session.id)

    let delivered = session.channel !== 'whatsapp'

    if (session.channel === 'whatsapp') {
      const { data: identity } = await admin
        .from('concierge_channel_identities')
        .select('external_address')
        .eq('patient_id', session.patient_id)
        .eq('channel', 'whatsapp')
        .eq('active', true)
        .order('verified_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!identity?.external_address) {
        return json(409, {
          error: 'whatsapp_identity_missing',
          messageId: message?.id || null,
        })
      }

      delivered = await sendWhatsApp(identity.external_address, content)
      if (!delivered) {
        await admin
          .from('concierge_chat_messages')
          .update({
            metadata: {
              source: 'mydatamed_live_console',
              outbound_channel: 'whatsapp',
              delivery_failed: true,
            },
          })
          .eq('id', message.id)
      }
    }

    return json(200, {
      ok: true,
      messageId: message?.id || null,
      channel: session.channel,
      delivered,
    })
  } catch (error) {
    console.error('Concierge outbound message error:', error)
    return json(500, { error: 'outbound_message_failed' })
  }
}

async function sendWhatsApp(to, body) {
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || '')
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '')
  const version = String(process.env.WHATSAPP_GRAPH_VERSION || 'v25.0')

  if (!accessToken || !phoneNumberId) return false

  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body },
      }),
    },
  )

  if (!response.ok) {
    console.error('WhatsApp outbound failed:', response.status, (await response.text()).slice(0, 500))
    return false
  }
  return true
}

function safeEqual(a, b) {
  if (!a || !b) return false
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  }
}
