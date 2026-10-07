import { createClient } from '@supabase/supabase-js'

export const config = {
  schedule: '0 * * * *',
}

export default async function handler(request) {
  try {
    const manualKey = request?.headers?.get?.('x-concierge-internal-key') || ''
    const configuredKey = String(process.env.CONCIERGE_INTERNAL_SERVICE_KEY || '')
    const scheduled = request?.headers?.get?.('x-nf-scheduled') === 'true'

    if (!scheduled && (!configuredKey || manualKey !== configuredKey)) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'server_not_configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await admin.rpc('concierge_refresh_operational_alerts_system')
    if (error) throw error

    return new Response(JSON.stringify({
      ok: true,
      inserted: Number(data || 0),
      ranAt: new Date().toISOString(),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Concierge operations scheduler failed:', error)
    return new Response(JSON.stringify({ error: 'scheduler_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
