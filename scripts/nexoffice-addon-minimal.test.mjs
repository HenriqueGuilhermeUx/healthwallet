import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NEXOFFICE_ADDON_CONTRACT,
  buildMyDataMedHandoffPayload,
  buildMyDataMedProvisionPayload,
  createNexOfficeAddonClient,
  isActiveMyDataMedSubscription,
  resolveMyDataMedAddonIdentity,
} from '../netlify/functions/_shared/nexoffice-addon.mjs'

function allKeys(value, out = []) {
  if (!value || typeof value !== 'object') return out
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, out)
    return out
  }
  for (const [key, child] of Object.entries(value)) {
    out.push(key.toLowerCase())
    allKeys(child, out)
  }
  return out
}

test('only active MyDataMed subscriptions are entitled', () => {
  assert.equal(isActiveMyDataMedSubscription({ status: 'active' }), true)
  assert.equal(isActiveMyDataMedSubscription({ status: 'trial' }), false)
  assert.equal(isActiveMyDataMedSubscription({ status: 'past_due' }), false)
  assert.equal(isActiveMyDataMedSubscription({ status: 'cancelled' }), false)
  assert.equal(isActiveMyDataMedSubscription(null), false)
})

test('workspace is stable and isolated per subscriber', () => {
  const user = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'pro@example.com',
    user_metadata: { full_name: 'Profissional Teste' },
  }
  const a = resolveMyDataMedAddonIdentity(user, null)
  const b = resolveMyDataMedAddonIdentity(user, null)
  assert.equal(a.externalWorkspaceRef, 'mydatamed:11111111-1111-1111-1111-111111111111')
  assert.equal(a.externalWorkspaceRef, b.externalWorkspaceRef)
  assert.equal(a.externalUserSubject, 'mydatamed:user:11111111-1111-1111-1111-111111111111')
})

test('provision payload contains only professional/add-on fields', () => {
  const identity = resolveMyDataMedAddonIdentity({
    id: '22222222-2222-2222-2222-222222222222',
    email: 'doctor@example.com',
    user_metadata: { full_name: 'Dra Teste' },
  })
  const payload = buildMyDataMedProvisionPayload(identity)

  assert.deepEqual(Object.keys(payload).sort(), [
    'businessName',
    'entitlements',
    'externalUserSubject',
    'externalWorkspaceRef',
    'memberRole',
    'ownerEmail',
    'ownerName',
    'sourceProduct',
    'vertical',
  ].sort())
  assert.equal(payload.sourceProduct, 'mydatamed')
  assert.equal(payload.vertical, 'health')
  assert.deepEqual(payload.entitlements, ['addon.mydatamed'])

  const keys = allKeys(payload)
  for (const forbidden of [
    'patientid',
    'patient_id',
    'medical_records',
    'medications',
    'medscore',
    'health_daily_summaries',
    'heart_rate',
    'exam',
    'passport',
  ]) {
    assert.equal(keys.includes(forbidden), false, `forbidden field leaked: ${forbidden}`)
  }
})

test('handoff payload is minimum federated identity only', () => {
  const identity = resolveMyDataMedAddonIdentity({
    id: '33333333-3333-3333-3333-333333333333',
    email: 'owner@example.com',
    user_metadata: { full_name: 'Owner Test' },
  })
  const payload = buildMyDataMedHandoffPayload(identity)
  assert.deepEqual(Object.keys(payload).sort(), [
    'email',
    'externalUserSubject',
    'externalWorkspaceRef',
    'sourceProduct',
  ].sort())
})

test('client calls only provision and handoff endpoints', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    return {
      ok: true,
      json: async () => url.endsWith('/handoff')
        ? { url: 'https://example.invalid/#handoff=test', expiresAt: '2026-09-18T12:00:00Z' }
        : { created: true },
    }
  }

  const identity = resolveMyDataMedAddonIdentity({
    id: '44444444-4444-4444-4444-444444444444',
    email: 'user@example.com',
    user_metadata: {},
  })
  const client = createNexOfficeAddonClient({
    baseUrl: 'https://nexoffice.example.invalid',
    internalKey: 'secret',
    fetchImpl,
  })

  await client.provision(identity)
  await client.handoff(identity)

  assert.deepEqual(calls.map(call => new URL(call.url).pathname), [
    '/v1/platform/provision',
    '/v1/platform/handoff',
  ])
  assert.equal(calls.some(call => call.url.includes('billing')), false)
  assert.equal(calls.some(call => call.url.includes('health-signals')), false)
})

test('contract explicitly disables sync and billing calls', () => {
  assert.equal(NEXOFFICE_ADDON_CONTRACT.clinicalSync, false)
  assert.equal(NEXOFFICE_ADDON_CONTRACT.automaticSync, false)
  assert.equal(NEXOFFICE_ADDON_CONTRACT.billingCall, false)
})
