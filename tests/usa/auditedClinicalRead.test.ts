import assert from "node:assert/strict"
import { runUSClinicalReadWithAudit, type USAuditedClinicalReadDependencies } from "../../src/usa/auditedClinicalRead.ts"
import type { USClinicalAccessRequest } from "../../src/usa/clinicalConsentPolicy.ts"

const eventId = "f4d694c2-e787-4f48-8e59-5d8a34d7b9ec"
const request: USClinicalAccessRequest = {
  actor: { userId: "synthetic-clinician", role: "clinician", tenantId: "synthetic-clinic" },
  patientId: "synthetic-patient",
  scope: "exams", purpose: "treatment",
  serverNow: "2026-10-25T20:00:00Z",
  grants: [{
    patientId: "synthetic-patient", tenantId: "synthetic-clinic",
    practitionerId: "synthetic-clinician", purpose: "treatment",
    scopes: ["exams"], issuedAt: "2026-09-01T00:00:00Z",
    expiresAt: "2026-11-01T00:00:00Z", revokedAt: null,
    version: "synthetic-v1",
  }],
}

function setup(overrides: Partial<USAuditedClinicalReadDependencies<string>> = {}) {
  const calls: string[] = []
  const deps: USAuditedClinicalReadDependencies<string> = {
    loadVerifiedRequest: async () => { calls.push("verified"); return request },
    newEventId: () => eventId,
    getAuditHmacKey: () => new Uint8Array(32).fill(37), // synthetic test key only
    commitAudit: async event => {
      calls.push("audit:" + event.decision)
      return { committed: true, eventId: event.eventId }
    },
    readProtectedData: async () => { calls.push("read"); return "synthetic-exam" },
    ...overrides,
  }
  return { deps, calls }
}

Deno.test("authorized read occurs only AFTER a durable committed audit", async () => {
  const { deps, calls } = setup()
  const result = await runUSClinicalReadWithAudit(deps)
  assert.deepEqual(calls, ["verified", "audit:allow", "read"])
  assert.deepEqual(result, {
    permitted: true, data: "synthetic-exam", auditEventId: eventId,
  })
})

Deno.test("revoked consent is durably audited as denied and never reads PHI", async () => {
  const { deps, calls } = setup({
    loadVerifiedRequest: async () => ({
      ...request, grants: [{ ...request.grants[0], revokedAt: "2026-10-20T00:00:00Z" }],
    }),
  })
  const result = await runUSClinicalReadWithAudit(deps)
  assert.deepEqual(calls, ["audit:deny"])
  assert.deepEqual(result, {
    permitted: false, reason: "NO_ACTIVE_CONSENT", auditEventId: eventId,
  })
})

Deno.test("unavailable audit writer prevents any clinical read", async () => {
  const { deps, calls } = setup({
    commitAudit: async () => { throw new Error("Audit backend unavailable") },
  })
  await assert.rejects(runUSClinicalReadWithAudit(deps), /Audit backend unavailable/)
  assert.equal(calls.includes("read"), false)
})

Deno.test("queue acknowledgments and wrong IDs are insufficient for clinical release", async () => {
  const { deps, calls } = setup({
    commitAudit: async () => ({ committed: false as true, eventId }),
  })
  await assert.rejects(runUSClinicalReadWithAudit(deps), /durability not confirmed/)
  assert.equal(calls.includes("read"), false)
  const other = setup({
    commitAudit: async () => ({ committed: true, eventId: "someone-else" }),
  })
  await assert.rejects(runUSClinicalReadWithAudit(other.deps), /durability not confirmed/)
  assert.equal(other.calls.includes("read"), false)
})

Deno.test("failed identity or consent verification never invokes a protected read", async () => {
  const { deps, calls } = setup({
    loadVerifiedRequest: async () => { throw new Error("Identity service unavailable") },
  })
  await assert.rejects(runUSClinicalReadWithAudit(deps), /Identity service unavailable/)
  assert.equal(calls.includes("read"), false)
  assert.equal(calls.some(v => v.startsWith("audit:")), false)
})
