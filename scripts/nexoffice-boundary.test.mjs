import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertExternalEffectsPolicy,
  buildAccessPayload,
  buildHealthSignalPayload,
  buildMyDataMedIdentity,
  buildProvisionPayload,
  createNexOfficePlatformClient,
  resolveMyDataMedWorkspace,
  validateHealthOperationalSignal,
} from '../netlify/functions/_shared/nexoffice.js'

const workspace = {externalWorkspaceRef: 'tenant-health-001', businessName: 'MyDataMed Health Ops'}
const identity = {
  email: 'professional@example.com',
  ownerName: 'Professional Example',
  memberRole: 'member',
  externalUserSubject: 'mydatamed:user:00000000-0000-0000-0000-000000000001',
}

const validSignal = {
  signalType: 'requests.summary',
  periodStart: '2026-09-16T00:00:00-03:00',
  periodEnd: '2026-09-16T23:59:59-03:00',
  dimensions: {window: 'day', scope: 'workspace'},
  metrics: {open: 4, overdue: 1, escalated: 2, resolved: 8},
  correlationId: 'requests-2026-09-16',
}

test('workspace is server-derived from staff metadata before env fallback', () => {
  const result = resolveMyDataMedWorkspace(
    {metadata: {nexoffice_workspace_ref: 'org-a', nexoffice_workspace_name: 'Org A'}},
    {NEXOFFICE_MYDATAMED_WORKSPACE_REF: 'env-ref', NEXOFFICE_MYDATAMED_WORKSPACE_NAME: 'Env Name'},
  )
  assert.deepEqual(result, {externalWorkspaceRef: 'org-a', businessName: 'Org A'})
})

test('workspace requires trusted server configuration', () => {
  assert.throws(() => resolveMyDataMedWorkspace({metadata: {}}, {}), /WORKSPACE_REF/)
})

test('federated identity contains only minimum professional identity', () => {
  const result = buildMyDataMedIdentity(
    {id: 'abc', email: 'Doctor@Example.com'},
    {role: 'doctor', display_name: 'Dra. Example', active: true, professional_registration: 'CRM-SECRET', specialty: 'Cardiology'},
  )
  assert.deepEqual(result, {
    email: 'doctor@example.com',
    ownerName: 'Dra. Example',
    memberRole: 'member',
    externalUserSubject: 'mydatamed:user:abc',
  })
  assert.equal('professional_registration' in result, false)
  assert.equal('specialty' in result, false)
})

test('provisioning is pinned to sourceProduct=mydatamed and vertical=health', () => {
  assert.deepEqual(buildProvisionPayload({workspace, identity}), {
    sourceProduct: 'mydatamed',
    vertical: 'health',
    externalWorkspaceRef: workspace.externalWorkspaceRef,
    businessName: workspace.businessName,
    ownerEmail: identity.email,
    ownerName: identity.ownerName,
    memberRole: identity.memberRole,
    externalUserSubject: identity.externalUserSubject,
    entitlements: [],
  })
})

test('access payload cannot carry clinical context', () => {
  const payload = buildAccessPayload({workspace, identity})
  assert.deepEqual(Object.keys(payload).sort(), ['email', 'externalUserSubject', 'externalWorkspaceRef', 'sourceProduct'].sort())
  assert.equal(JSON.stringify(payload).includes('medscore'), false)
  assert.equal(JSON.stringify(payload).includes('medical'), false)
})

test('valid aggregate health signal is accepted and pinned to workspace', () => {
  const payload = buildHealthSignalPayload({workspace, signal: validSignal})
  assert.equal(payload.sourceProduct, 'mydatamed')
  assert.equal(payload.externalWorkspaceRef, workspace.externalWorkspaceRef)
  assert.equal(payload.dimensions.scope, 'workspace')
  assert.deepEqual(payload.metrics, validSignal.metrics)
})

test('member-level Health scope is rejected', () => {
  assert.throws(
    () => validateHealthOperationalSignal({...validSignal, dimensions: {window: 'day', scope: 'member'}}),
    /workspace\/team/,
  )
})

test('patient-level identifiers are rejected as extra fields', () => {
  assert.throws(
    () => validateHealthOperationalSignal({...validSignal, patientId: 'patient-123'}),
    /forbidden field: patientId/,
  )
})

test('raw clinical payloads are rejected as extra fields', () => {
  for (const field of ['exam', 'medications', 'medscore', 'deviceData', 'medicalPassport']) {
    assert.throws(
      () => validateHealthOperationalSignal({...validSignal, [field]: {raw: true}}),
      new RegExp(`forbidden field: ${field}`),
    )
  }
})

test('unexpected clinical metrics are rejected', () => {
  assert.throws(
    () => validateHealthOperationalSignal({...validSignal, metrics: {...validSignal.metrics, heartRate: 72}}),
    /forbidden field: heartRate/,
  )
})

test('SLA compliance ratio is constrained to 0..1', () => {
  assert.throws(
    () => validateHealthOperationalSignal({
      signalType: 'sla.summary',
      periodStart: validSignal.periodStart,
      periodEnd: validSignal.periodEnd,
      dimensions: {window: 'day', scope: 'team'},
      metrics: {total: 10, withinSla: 9, breached: 1, avgFirstResponseMinutes: 22.5, complianceRatio: 1.1},
    }),
    /between 0 and 1/,
  )
})

test('staging policy refuses external effects', () => {
  assert.doesNotThrow(() => assertExternalEffectsPolicy({externalEffects: false}, true))
  assert.throws(() => assertExternalEffectsPolicy({externalEffects: true}, true), /externalEffects=false/)
})

test('typed client calls canonical NexOffice platform endpoints with internal key', async () => {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({url, options})
    return {
      ok: true,
      status: 200,
      async text() {
        if (url.endsWith('/v1/platform/health')) return JSON.stringify({status: 'ok', service: 'nexoffice-platform', capabilities: [], externalEffects: false})
        if (url.endsWith('/v1/platform/provision')) return JSON.stringify({created: true, userExists: true, workspace: {}, origin: {}})
        if (url.endsWith('/v1/platform/session-exchange')) return JSON.stringify({token: 'session', expiresAt: 'soon', workspace: {}})
        if (url.endsWith('/v1/platform/handoff')) return JSON.stringify({handoffCode: 'code', expiresAt: 'soon', url: 'https://example.invalid/#handoff=code'})
        if (url.endsWith('/v1/platform/health-signals')) return JSON.stringify({ok: true, privacy: 'aggregate_only', signal: {}})
        return '{}'
      },
    }
  }

  const client = createNexOfficePlatformClient({baseUrl: 'https://nexoffice.test', internalKey: 'test-key', fetchImpl})
  await client.health()
  await client.provisionMyDataMed({workspace, identity})
  await client.exchangeMyDataMedSession({workspace, identity})
  await client.createMyDataMedHandoff({workspace, identity})
  await client.pushMyDataMedHealthSignal({workspace, signal: validSignal})

  assert.deepEqual(calls.map(call => new URL(call.url).pathname), [
    '/v1/platform/health',
    '/v1/platform/provision',
    '/v1/platform/session-exchange',
    '/v1/platform/handoff',
    '/v1/platform/health-signals',
  ])
  for (const call of calls) assert.equal(call.options.headers['x-nexoffice-key'], 'test-key')

  const signalBody = JSON.parse(calls.at(-1).options.body)
  assert.equal(signalBody.sourceProduct, 'mydatamed')
  assert.equal(signalBody.externalWorkspaceRef, 'tenant-health-001')
  assert.equal('patientId' in signalBody, false)
})
