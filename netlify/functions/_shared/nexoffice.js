const SOURCE_PRODUCT = 'mydatamed'
const VERTICAL = 'health'

const SIGNAL_SCHEMAS = Object.freeze({
  'appointments.summary': ['scheduled', 'completed', 'cancelled', 'noShow', 'pending'],
  'requests.summary': ['open', 'overdue', 'escalated', 'resolved'],
  'sla.summary': ['total', 'withinSla', 'breached', 'avgFirstResponseMinutes', 'complianceRatio'],
  'workload.summary': ['activeCases', 'waitingReview', 'waitingPatientReply', 'dueToday'],
  'programs.summary': ['enrolled', 'active', 'completed', 'paused'],
})

const WINDOWS = new Set(['hour', 'day', 'week', 'month'])
const SCOPES = new Set(['workspace', 'team'])
const STAFF_ROLES = new Set(['admin', 'care_coordinator', 'doctor', 'nurse'])
const SIGNAL_KEYS = new Set(['signalType', 'periodStart', 'periodEnd', 'dimensions', 'metrics', 'correlationId'])

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertExactKeys(value, allowed, label) {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains forbidden field: ${key}`)
  }
}

function assertIsoDate(value, label) {
  if (typeof value !== 'string' || !value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO datetime`)
  }
}

function assertMetric(value, key) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`metric ${key} must be a non-negative finite number`)
  }
  if (key === 'complianceRatio' && value > 1) {
    throw new Error('metric complianceRatio must be between 0 and 1')
  }
  if (key !== 'avgFirstResponseMinutes' && key !== 'complianceRatio' && !Number.isInteger(value)) {
    throw new Error(`metric ${key} must be an integer`)
  }
}

export function validateHealthOperationalSignal(input) {
  assertExactKeys(input, SIGNAL_KEYS, 'health signal')

  const metricKeys = SIGNAL_SCHEMAS[input.signalType]
  if (!metricKeys) throw new Error(`unsupported Health signal type: ${String(input.signalType || '')}`)

  assertIsoDate(input.periodStart, 'periodStart')
  assertIsoDate(input.periodEnd, 'periodEnd')
  if (Date.parse(input.periodEnd) < Date.parse(input.periodStart)) {
    throw new Error('periodEnd must be greater than or equal to periodStart')
  }

  assertExactKeys(input.dimensions, new Set(['window', 'scope']), 'dimensions')
  if (!WINDOWS.has(input.dimensions.window)) throw new Error('invalid operational window')
  if (!SCOPES.has(input.dimensions.scope)) throw new Error('Health signals only allow workspace/team scope')

  assertExactKeys(input.metrics, new Set(metricKeys), 'metrics')
  for (const key of metricKeys) {
    if (!(key in input.metrics)) throw new Error(`metrics missing required field: ${key}`)
    assertMetric(input.metrics[key], key)
  }

  if (input.correlationId !== undefined) {
    if (typeof input.correlationId !== 'string' || input.correlationId.trim().length < 8 || input.correlationId.length > 220) {
      throw new Error('invalid correlationId')
    }
  }

  return {
    signalType: input.signalType,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    dimensions: {window: input.dimensions.window, scope: input.dimensions.scope},
    metrics: Object.fromEntries(metricKeys.map(key => [key, input.metrics[key]])),
    ...(input.correlationId ? {correlationId: input.correlationId.trim()} : {}),
  }
}

export function resolveMyDataMedWorkspace(staff, env = process.env) {
  const metadata = isPlainObject(staff?.metadata) ? staff.metadata : {}
  const externalWorkspaceRef = String(metadata.nexoffice_workspace_ref || env.NEXOFFICE_MYDATAMED_WORKSPACE_REF || '').trim()
  const businessName = String(metadata.nexoffice_workspace_name || env.NEXOFFICE_MYDATAMED_WORKSPACE_NAME || '').trim()

  if (!externalWorkspaceRef || externalWorkspaceRef.length > 220) {
    throw new Error('NEXOFFICE_MYDATAMED_WORKSPACE_REF is required and must be <= 220 chars')
  }
  if (!businessName || businessName.length < 2 || businessName.length > 180) {
    throw new Error('NEXOFFICE_MYDATAMED_WORKSPACE_NAME is required and must be 2..180 chars')
  }

  return {externalWorkspaceRef, businessName}
}

export function buildMyDataMedIdentity(user, staff) {
  if (!user?.id || !user?.email) throw new Error('Authenticated MyDataMed identity with email is required')
  if (!staff?.active || !STAFF_ROLES.has(staff.role)) throw new Error('Active MyDataMed professional role is required')

  const ownerName = String(staff.display_name || user.email.split('@')[0] || 'MyDataMed professional').trim().slice(0, 160)
  const memberRole = staff.role === 'admin' ? 'owner' : staff.role === 'care_coordinator' ? 'admin' : 'member'

  return {
    email: String(user.email).trim().toLowerCase(),
    ownerName,
    memberRole,
    externalUserSubject: `mydatamed:user:${user.id}`,
  }
}

export function buildProvisionPayload({workspace, identity}) {
  return {
    sourceProduct: SOURCE_PRODUCT,
    vertical: VERTICAL,
    externalWorkspaceRef: workspace.externalWorkspaceRef,
    businessName: workspace.businessName,
    ownerEmail: identity.email,
    ownerName: identity.ownerName,
    memberRole: identity.memberRole,
    externalUserSubject: identity.externalUserSubject,
    entitlements: [],
  }
}

export function buildAccessPayload({workspace, identity}) {
  return {
    sourceProduct: SOURCE_PRODUCT,
    externalWorkspaceRef: workspace.externalWorkspaceRef,
    externalUserSubject: identity.externalUserSubject,
    email: identity.email,
  }
}

export function buildHealthSignalPayload({workspace, signal}) {
  const clean = validateHealthOperationalSignal(signal)
  return {
    ...clean,
    sourceProduct: SOURCE_PRODUCT,
    externalWorkspaceRef: workspace.externalWorkspaceRef,
  }
}

export function assertExternalEffectsPolicy(health, enforceOff) {
  if (enforceOff && health?.externalEffects !== false) {
    throw new Error('NexOffice staging must keep externalEffects=false')
  }
  return health
}

export function createNexOfficePlatformClient({baseUrl, internalKey, timeoutMs = 10000, fetchImpl = fetch}) {
  const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/$/, '')
  if (!normalizedBaseUrl) throw new Error('NEXOFFICE_API_BASE_URL is required')
  if (!internalKey) throw new Error('NEXOFFICE_INTERNAL_KEY is required')

  async function request(path, method = 'POST', body) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          'x-nexoffice-key': internalKey,
          ...(body === undefined ? {} : {'content-type': 'application/json'}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
      const text = await response.text()
      let payload = {}
      try { payload = text ? JSON.parse(text) : {} } catch { payload = {message: text.slice(0, 1000)} }
      if (!response.ok) {
        const error = new Error(String(payload?.message || payload?.error || `NexOffice HTTP ${response.status}`))
        error.status = response.status
        error.code = payload?.error
        throw error
      }
      return payload
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    health: () => request('/v1/platform/health', 'GET'),
    provisionMyDataMed: input => request('/v1/platform/provision', 'POST', buildProvisionPayload(input)),
    exchangeMyDataMedSession: input => request('/v1/platform/session-exchange', 'POST', buildAccessPayload(input)),
    createMyDataMedHandoff: input => request('/v1/platform/handoff', 'POST', buildAccessPayload(input)),
    pushMyDataMedHealthSignal: input => request('/v1/platform/health-signals', 'POST', buildHealthSignalPayload(input)),
  }
}

export const NEXOFFICE_HEALTH_BOUNDARY = Object.freeze({
  sourceProduct: SOURCE_PRODUCT,
  vertical: VERTICAL,
  privacy: 'aggregate_only',
  allowedScopes: ['workspace', 'team'],
  allowedSignalTypes: Object.keys(SIGNAL_SCHEMAS),
})
