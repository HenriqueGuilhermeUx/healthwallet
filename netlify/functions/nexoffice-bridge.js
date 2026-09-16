import { createClient } from '@supabase/supabase-js'
import {
  assertExternalEffectsPolicy,
  buildMyDataMedIdentity,
  createNexOfficePlatformClient,
  resolveMyDataMedWorkspace,
  validateHealthOperationalSignal,
} from './_shared/nexoffice.js'

const JSON_HEADERS = {'content-type': 'application/json; charset=utf-8'}

function reply(statusCode, body) {
  return {statusCode, headers: JSON_HEADERS, body: JSON.stringify(body)}
}

function bearerToken(event) {
  const raw = String(event.headers?.authorization || event.headers?.Authorization || '')
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

function requiredEnv(name, fallbackName) {
  const value = String(process.env[name] || (fallbackName ? process.env[fallbackName] : '') || '').trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

async function authenticateProfessional(event) {
  const token = bearerToken(event)
  if (!token) {
    const error = new Error('Authentication required')
    error.status = 401
    throw error
  }

  const supabaseUrl = requiredEnv('VITE_SUPABASE_URL', 'SUPABASE_URL')
  const supabaseAnonKey = requiredEnv('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY')
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
    global: {headers: {Authorization: `Bearer ${token}`}},
  })

  const {data: userResult, error: userError} = await supabase.auth.getUser(token)
  const user = userResult?.user
  if (userError || !user) {
    const error = new Error('Invalid or expired session')
    error.status = 401
    throw error
  }

  const {data: staff, error: staffError} = await supabase
    .from('concierge_staff')
    .select('user_id,role,display_name,active,metadata')
    .eq('user_id', user.id)
    .maybeSingle()

  if (staffError) throw staffError
  if (!staff?.active) {
    const error = new Error('Active MyDataMed professional role required')
    error.status = 403
    throw error
  }

  return {user, staff}
}

function clientFromEnv() {
  return createNexOfficePlatformClient({
    baseUrl: requiredEnv('NEXOFFICE_API_BASE_URL'),
    internalKey: requiredEnv('NEXOFFICE_INTERNAL_KEY'),
    timeoutMs: Number(process.env.NEXOFFICE_TIMEOUT_MS || 10000),
  })
}

async function enforceStagingPolicy(client) {
  const enforceOff = String(process.env.NEXOFFICE_ENFORCE_EXTERNAL_EFFECTS_OFF || '').toLowerCase() === 'true'
  if (!enforceOff) return null
  const health = await client.health()
  return assertExternalEffectsPolicy(health, true)
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return reply(204, {})
  if (event.httpMethod !== 'POST') return reply(405, {error: 'method_not_allowed'})

  try {
    const {user, staff} = await authenticateProfessional(event)
    const input = JSON.parse(event.body || '{}')
    const action = String(input.action || '').trim()
    const workspace = resolveMyDataMedWorkspace(staff, process.env)
    const identity = buildMyDataMedIdentity(user, staff)
    const client = clientFromEnv()

    if (action === 'health') {
      const health = await client.health()
      assertExternalEffectsPolicy(
        health,
        String(process.env.NEXOFFICE_ENFORCE_EXTERNAL_EFFECTS_OFF || '').toLowerCase() === 'true',
      )
      return reply(200, {
        ok: true,
        service: health.service,
        capabilities: health.capabilities,
        externalEffects: health.externalEffects,
      })
    }

    await enforceStagingPolicy(client)

    if (action === 'provision') {
      const result = await client.provisionMyDataMed({workspace, identity})
      return reply(200, {
        ok: true,
        created: Boolean(result.created),
        userExists: Boolean(result.userExists),
        memberRole: result.memberRole || identity.memberRole,
        workspace: result.workspace,
        origin: result.origin,
      })
    }

    if (action === 'handoff') {
      const result = await client.createMyDataMedHandoff({workspace, identity})
      return reply(200, {
        ok: true,
        handoffCode: result.handoffCode,
        expiresAt: result.expiresAt,
        url: result.url,
      })
    }

    if (action === 'session_exchange') {
      const result = await client.exchangeMyDataMedSession({workspace, identity})
      return reply(200, {
        ok: true,
        token: result.token,
        expiresAt: result.expiresAt,
        workspace: result.workspace,
      })
    }

    if (action === 'health_signal') {
      if (!['admin', 'care_coordinator'].includes(staff.role)) {
        return reply(403, {error: 'aggregate_signal_role_required'})
      }
      const signal = validateHealthOperationalSignal(input.signal)
      const result = await client.pushMyDataMedHealthSignal({workspace, signal})
      return reply(200, {
        ok: true,
        privacy: result.privacy,
        signal: result.signal,
      })
    }

    return reply(400, {error: 'unsupported_action'})
  } catch (error) {
    const status = Number(error?.status || 500)
    return reply(status >= 400 && status < 600 ? status : 500, {
      error: error?.code || 'nexoffice_bridge_error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
