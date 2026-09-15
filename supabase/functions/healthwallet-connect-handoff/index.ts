import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.106.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const HEALTHWALLET_WEB_ORIGIN = Deno.env.get('HEALTHWALLET_WEB_ORIGIN') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FULL_METRICS = [
  'steps',
  'sleep',
  'heartRate',
  'restingHeartRate',
  'oxygenSaturation',
  'heartRateVariability',
  'bloodPressure',
  'weight',
  'calories',
  'exerciseTime',
] as const

const allowedMetrics = new Set<string>(FULL_METRICS)

type ConnectProfile = 'minimal' | 'full'

type RequestBody = {
  action?: 'issue' | 'redeem'
  code?: string
  profile?: ConnectProfile
  metrics?: string[]
  days?: number
  return_to?: string
  state?: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, private',
    },
  })
}

function cleanText(value: unknown, max = 300) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function clampDays(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 30
  return Math.max(1, Math.min(90, Math.round(parsed)))
}

function normalizeProfile(value: unknown): ConnectProfile {
  return value === 'full' ? 'full' : 'minimal'
}

function normalizeMetrics(profile: ConnectProfile, value: unknown) {
  if (profile === 'minimal') return ['steps']
  if (!Array.isArray(value)) return [...FULL_METRICS]

  const requested = value
    .map((item) => cleanText(item, 40))
    .filter((item) => allowedMetrics.has(item))

  return requested.length ? Array.from(new Set(requested)) : [...FULL_METRICS]
}

function isAllowedReturnUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol === 'healthwallet:') return true

    if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && /^https?:$/.test(url.protocol)) {
      return true
    }

    if (HEALTHWALLET_WEB_ORIGIN && /^https?:$/.test(url.protocol)) {
      return url.origin === new URL(HEALTHWALLET_WEB_ORIGIN).origin
    }
  } catch {
    return false
  }

  return false
}

function defaultReturnUrl() {
  return 'healthwallet://connect-complete'
}

function randomCode(bytes = 32) {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return base64Url(buffer)
}

function base64Url(buffer: Uint8Array) {
  let binary = ''
  for (const byte of buffer) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function adminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service configuration is missing.')
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function authenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization') || ''
  if (!authorization.startsWith('Bearer ')) return null
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

async function issue(req: Request, body: RequestBody) {
  const user = await authenticatedUser(req)
  if (!user) return json({ error: 'unauthorized' }, 401)

  const profile = normalizeProfile(body.profile)
  const metrics = normalizeMetrics(profile, body.metrics)
  const days = clampDays(body.days)
  const requestedReturnTo = cleanText(body.return_to, 500)
  const returnTo = isAllowedReturnUrl(requestedReturnTo) ? requestedReturnTo : defaultReturnUrl()
  const state = cleanText(body.state, 180) || crypto.randomUUID()
  const code = randomCode()
  const codeHash = await sha256(code)
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString()
  const admin = adminClient()

  await admin
    .from('health_connect_handoffs')
    .delete()
    .eq('user_id', user.id)
    .lt('expires_at', new Date().toISOString())

  const { error } = await admin.from('health_connect_handoffs').insert({
    code_hash: codeHash,
    user_id: user.id,
    profile,
    metrics,
    days,
    return_to: returnTo,
    state,
    expires_at: expiresAt,
  })

  if (error) {
    console.error('healthwallet-connect handoff issue failed', error)
    return json({ error: 'handoff_issue_failed' }, 500)
  }

  return json({
    code,
    profile,
    metrics,
    days,
    state,
    return_to: returnTo,
    expires_at: expiresAt,
  })
}

async function releaseClaim(admin: ReturnType<typeof adminClient>, codeHash: string, claimedAt: string) {
  const { error } = await admin
    .from('health_connect_handoffs')
    .update({ redeemed_at: null })
    .eq('code_hash', codeHash)
    .eq('redeemed_at', claimedAt)

  if (error) console.error('healthwallet-connect handoff claim release failed', error)
}

async function redeem(body: RequestBody) {
  const code = cleanText(body.code, 220)
  if (code.length < 32) return json({ error: 'invalid_handoff' }, 400)

  const codeHash = await sha256(code)
  const admin = adminClient()
  const now = new Date().toISOString()

  const { data: handoff, error: redeemError } = await admin
    .from('health_connect_handoffs')
    .update({ redeemed_at: now })
    .eq('code_hash', codeHash)
    .is('redeemed_at', null)
    .gt('expires_at', now)
    .select('user_id, profile, metrics, days, return_to, state, expires_at')
    .maybeSingle()

  if (redeemError) {
    console.error('healthwallet-connect handoff redeem failed', redeemError)
    return json({ error: 'handoff_redeem_failed' }, 500)
  }

  if (!handoff) return json({ error: 'invalid_or_expired_handoff' }, 401)

  const { data: userResult, error: userError } = await admin.auth.admin.getUserById(handoff.user_id)
  const email = userResult?.user?.email

  if (userError || !email) {
    console.error('healthwallet-connect user lookup failed', userError)
    await releaseClaim(admin, codeHash, now)
    return json({ error: 'handoff_user_unavailable' }, 500)
  }

  const { data: generated, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (linkError || !generated) {
    console.error('healthwallet-connect magic link generation failed', linkError)
    await releaseClaim(admin, codeHash, now)
    return json({ error: 'handoff_session_failed' }, 500)
  }

  const properties = generated.properties as Record<string, unknown> | null
  let tokenHash = cleanText(properties?.hashed_token ?? properties?.hashedToken, 500)

  if (!tokenHash) {
    const actionLink = cleanText(properties?.action_link ?? properties?.actionLink, 2000)
    if (actionLink) {
      try {
        const link = new URL(actionLink)
        tokenHash = cleanText(link.searchParams.get('token') || link.searchParams.get('token_hash'), 500)
      } catch {
        tokenHash = ''
      }
    }
  }

  if (!tokenHash) {
    console.error('healthwallet-connect generateLink returned no token hash')
    await releaseClaim(admin, codeHash, now)
    return json({ error: 'handoff_token_unavailable' }, 500)
  }

  return json({
    token_hash: tokenHash,
    profile: normalizeProfile(handoff.profile),
    metrics: normalizeMetrics(normalizeProfile(handoff.profile), handoff.metrics),
    days: clampDays(handoff.days),
    return_to: isAllowedReturnUrl(handoff.return_to || '') ? handoff.return_to : defaultReturnUrl(),
    state: cleanText(handoff.state, 180),
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const body = await req.json() as RequestBody
    if (body.action === 'issue') return await issue(req, body)
    if (body.action === 'redeem') return await redeem(body)
    return json({ error: 'invalid_action' }, 400)
  } catch (error) {
    console.error('healthwallet-connect-handoff unexpected error', error)
    return json({ error: 'unexpected_error' }, 500)
  }
})
