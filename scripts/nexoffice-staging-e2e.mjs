import assert from 'node:assert/strict'
import {
  assertExternalEffectsPolicy,
  createNexOfficePlatformClient,
} from '../netlify/functions/_shared/nexoffice.js'

const baseUrl = String(process.env.NEXOFFICE_API_BASE_URL || '').trim().replace(/\/$/, '')
const internalKey = String(process.env.NEXOFFICE_INTERNAL_KEY || '').trim()

if (!baseUrl || !internalKey) {
  throw new Error('NEXOFFICE_API_BASE_URL and NEXOFFICE_INTERNAL_KEY are required for staging E2E')
}

const workspace = {
  externalWorkspaceRef: String(
    process.env.NEXOFFICE_STAGING_E2E_WORKSPACE_REF || 'healthwallet-mydatamed-controlled-validation-v1',
  ).trim(),
  businessName: 'HealthWallet MyDataMed Controlled Validation',
}

const identity = {
  email: 'healthwallet-nexoffice-staging@example.com',
  ownerName: 'HealthWallet NexOffice Staging',
  memberRole: 'owner',
  externalUserSubject: 'mydatamed:test:healthwallet-nexoffice-staging',
}

const client = createNexOfficePlatformClient({
  baseUrl,
  internalKey,
  timeoutMs: 30_000,
})

async function rawRequest(path, {method = 'GET', body, withInternalKey = true} = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(withInternalKey ? {'x-nexoffice-key': internalKey} : {}),
        ...(body === undefined ? {} : {'content-type': 'application/json'}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    let payload = {}
    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      payload = {message: text.slice(0, 500)}
    }
    return {response, payload}
  } finally {
    clearTimeout(timer)
  }
}

function assertToken(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`)
  assert.ok(value.length >= 20, `${label} must be non-trivial`)
}

function assertClientRejection(result, label) {
  assert.ok(
    result.response.status >= 400 && result.response.status < 500,
    `${label} must be rejected with a 4xx response; got ${result.response.status}`,
  )
}

const health = await client.health()
assertExternalEffectsPolicy(health, true)
assert.equal(health.status, 'ok')
assert.equal(health.externalEffects, false)

const firstProvision = await client.provisionMyDataMed({workspace, identity})
assert.equal(firstProvision.workspace?.vertical, 'health')
assert.equal(firstProvision.workspace?.status, 'active')
assert.ok(firstProvision.workspace?.id, 'provisioning must return workspace id')

const secondProvision = await client.provisionMyDataMed({workspace, identity})
assert.equal(secondProvision.workspace?.id, firstProvision.workspace.id, 'provisioning must be tenant-idempotent')
assert.equal(secondProvision.created, false, 'second provisioning call must not create a second workspace')

const session = await client.exchangeMyDataMedSession({workspace, identity})
assertToken(session.token, 'federated session token')
assert.equal(session.workspace?.id, firstProvision.workspace.id)
assert.equal(session.workspace?.vertical, 'health')

const handoff = await client.createMyDataMedHandoff({workspace, identity})
assertToken(handoff.handoffCode, 'handoff code')
assert.ok(handoff.expiresAt, 'handoff must have expiry')

const consumed = await rawRequest('/v1/platform/handoff/consume', {
  method: 'POST',
  withInternalKey: false,
  body: {code: handoff.handoffCode},
})
assert.equal(consumed.response.status, 200, 'first handoff consume must succeed')
assertToken(consumed.payload.token, 'handoff session token')
assert.equal(consumed.payload.workspace?.id, firstProvision.workspace.id)

const consumedAgain = await rawRequest('/v1/platform/handoff/consume', {
  method: 'POST',
  withInternalKey: false,
  body: {code: handoff.handoffCode},
})
assert.equal(consumedAgain.response.status, 401, 'handoff must be one-time')

const now = new Date()
const periodEnd = now.toISOString()
const periodStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
const aggregateCorrelationId = 'hw-staging-appointments-v1'

const acceptedSignal = await client.pushMyDataMedHealthSignal({
  workspace,
  signal: {
    signalType: 'appointments.summary',
    periodStart,
    periodEnd,
    dimensions: {window: 'hour', scope: 'workspace'},
    metrics: {
      scheduled: 12,
      completed: 8,
      cancelled: 1,
      noShow: 1,
      pending: 2,
    },
    correlationId: aggregateCorrelationId,
  },
})
assert.equal(acceptedSignal.ok, true)
assert.equal(acceptedSignal.privacy, 'aggregate_only')
assert.equal(acceptedSignal.signal?.correlation_id, aggregateCorrelationId)

const memberScopeRejected = await rawRequest('/v1/platform/health-signals', {
  method: 'POST',
  body: {
    sourceProduct: 'mydatamed',
    externalWorkspaceRef: workspace.externalWorkspaceRef,
    signalType: 'appointments.summary',
    periodStart,
    periodEnd,
    dimensions: {window: 'hour', scope: 'member'},
    metrics: {scheduled: 1, completed: 0, cancelled: 0, noShow: 0, pending: 1},
    correlationId: 'hw-staging-member-scope-v1',
  },
})
assertClientRejection(memberScopeRejected, 'member-level Health scope')

const patientIdentifierRejected = await rawRequest('/v1/platform/health-signals', {
  method: 'POST',
  body: {
    sourceProduct: 'mydatamed',
    externalWorkspaceRef: workspace.externalWorkspaceRef,
    signalType: 'requests.summary',
    periodStart,
    periodEnd,
    dimensions: {window: 'hour', scope: 'workspace'},
    metrics: {open: 2, overdue: 0, escalated: 0, resolved: 1},
    correlationId: 'hw-staging-patient-id-v1',
    patientId: 'synthetic-patient-must-never-cross',
  },
})
assertClientRejection(patientIdentifierRejected, 'patient-level identifier')

const list = await rawRequest(
  `/v1/platform/health-signals?sourceProduct=mydatamed&externalWorkspaceRef=${encodeURIComponent(workspace.externalWorkspaceRef)}&limit=100`,
)
assert.equal(list.response.status, 200)
assert.equal(list.payload.privacy, 'aggregate_only')
assert.equal(list.payload.workspace?.id, firstProvision.workspace.id)

const matchingSignals = (list.payload.signals || []).filter(
  signal => signal.correlation_id === aggregateCorrelationId,
)
assert.equal(matchingSignals.length, 1, 'aggregate correlation id must remain idempotent')

const serializedSignals = JSON.stringify(list.payload.signals || []).toLowerCase()
for (const forbidden of [
  'patientid',
  'cpf',
  'medical_records',
  'medscore',
  'medicalpassport',
  'heartrate',
  'medication',
  'diagnosis',
]) {
  assert.equal(serializedSignals.includes(forbidden), false, `forbidden clinical key leaked: ${forbidden}`)
}

console.log('NEXOFFICE STAGING E2E PASS')
console.log(`workspaceId=${firstProvision.workspace.id}`)
console.log('privacy=aggregate_only')
console.log('externalEffects=false')
console.log('provisioning=idempotent')
console.log('handoff=one-time')
console.log('sessionExchange=ok')
console.log('memberScope=rejected')
console.log('patientIdentifier=rejected')
