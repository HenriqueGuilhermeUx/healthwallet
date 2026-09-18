const SOURCE_PRODUCT = 'mydatamed'
const VERTICAL = 'health'

function text(value, max = 220) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function isActiveMyDataMedSubscription(record) {
  return Boolean(record && String(record.status || '').toLowerCase() === 'active')
}

export function resolveMyDataMedAddonIdentity(user, subscription = null) {
  const userId = text(user?.id)
  const email = text(user?.email).toLowerCase()
  if (!userId || !email) throw new Error('Authenticated MyDataMed user is required')

  const metadata = user?.user_metadata || {}
  const displayName = text(
    metadata.full_name || metadata.name || metadata.display_name || email.split('@')[0] || 'MyDataMed',
    160,
  ) || 'MyDataMed'

  const clinicName = text(subscription?.clinic_name, 180)
  const businessName = clinicName || `MyDataMed · ${displayName}`.slice(0, 180)

  return {
    externalWorkspaceRef: `mydatamed:${userId}`,
    externalUserSubject: `mydatamed:user:${userId}`,
    email,
    ownerName: displayName,
    businessName,
    memberRole: 'owner',
  }
}

export function buildMyDataMedProvisionPayload(identity) {
  return {
    sourceProduct: SOURCE_PRODUCT,
    externalWorkspaceRef: identity.externalWorkspaceRef,
    businessName: identity.businessName,
    vertical: VERTICAL,
    ownerEmail: identity.email,
    ownerName: identity.ownerName,
    memberRole: identity.memberRole,
    externalUserSubject: identity.externalUserSubject,
    entitlements: ['addon.mydatamed'],
  }
}

export function buildMyDataMedHandoffPayload(identity) {
  return {
    sourceProduct: SOURCE_PRODUCT,
    externalWorkspaceRef: identity.externalWorkspaceRef,
    externalUserSubject: identity.externalUserSubject,
    email: identity.email,
  }
}

export function createNexOfficeAddonClient({ baseUrl, internalKey, timeoutMs = 12000, fetchImpl = fetch }) {
  const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/$/, '')
  if (!normalizedBaseUrl) throw new Error('NEXOFFICE_API_BASE_URL is required')
  if (!internalKey) throw new Error('NEXOFFICE_INTERNAL_KEY is required')

  async function post(path, body) {
    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-nexoffice-key': internalKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(String(payload?.message || payload?.error || `NexOffice HTTP ${response.status}`))
      error.status = response.status
      error.code = payload?.error
      throw error
    }
    return payload
  }

  return {
    provision: identity => post('/v1/platform/provision', buildMyDataMedProvisionPayload(identity)),
    handoff: identity => post('/v1/platform/handoff', buildMyDataMedHandoffPayload(identity)),
  }
}

export const NEXOFFICE_ADDON_CONTRACT = Object.freeze({
  sourceProduct: SOURCE_PRODUCT,
  vertical: VERTICAL,
  entitlement: 'addon.mydatamed',
  calls: ['/v1/platform/provision', '/v1/platform/handoff'],
  clinicalSync: false,
  automaticSync: false,
  billingCall: false,
})
