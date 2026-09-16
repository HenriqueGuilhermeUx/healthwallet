import { assertExternalEffectsPolicy, createNexOfficePlatformClient } from '../netlify/functions/_shared/nexoffice.js'

const baseUrl = String(process.env.NEXOFFICE_API_BASE_URL || '').trim()
const internalKey = String(process.env.NEXOFFICE_INTERNAL_KEY || '').trim()
const enforceOff = String(process.env.NEXOFFICE_ENFORCE_EXTERNAL_EFFECTS_OFF || 'true').toLowerCase() === 'true'

if (!baseUrl || !internalKey) {
  console.error('NEXOFFICE_API_BASE_URL and NEXOFFICE_INTERNAL_KEY are required for live smoke.')
  process.exit(2)
}

const client = createNexOfficePlatformClient({baseUrl, internalKey})
const health = await client.health()
assertExternalEffectsPolicy(health, enforceOff)

console.log(JSON.stringify({
  ok: true,
  service: health.service,
  externalEffects: health.externalEffects,
  capabilities: health.capabilities,
}, null, 2))
