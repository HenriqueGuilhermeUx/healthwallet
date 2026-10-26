import assert from "node:assert/strict"
import {
  runUSAuditedLongitudinalRead,
  type USLongitudinalReadDependencies,
} from "../../src/usa/auditedLongitudinalRead.ts"
import type { USClinicalAccessRequest, VerifiedUSClinicalGrant } from "../../src/usa/clinicalConsentPolicy.ts"

const grant: VerifiedUSClinicalGrant = {
  patientId: "synthetic-patient", tenantId: "synthetic-clinic",
  practitionerId: "synthetic-physician", purpose: "treatment",
  scopes: ["exams", "clinical_tasks"],
  issuedAt: "2026-10-01T00:00:00Z",
  expiresAt: "2026-11-01T00:00:00Z",
  revokedAt: null, version: "v1",
}
const exams: USClinicalAccessRequest = {
  actor: { userId: "synthetic-physician", role: "clinician", tenantId: "synthetic-clinic" },
  patientId: "synthetic-patient", purpose: "treatment", scope: "exams",
  serverNow: "2026-10-25T22:00:00Z", grants: [grant],
}
const tasks: USClinicalAccessRequest = { ...exams, scope: "clinical_tasks" }
const ids: [string, string] = [
  "e4d694c2-e787-4f48-8e59-5d8a34d7b9ec",
  "a4d694c2-e787-4f48-8e59-5d8a34d7b9ed",
]
const origin = "https://synthetic-hospital.example"
const bundle = {
  resourceType: "Bundle", type: "searchset",
  entry: [{ resource: {
    resourceType: "Observation", id: "obs-1", status: "final",
    subject: { reference: "Patient/synthetic-patient" },
    effectiveDateTime: "2026-10-24T00:00:00Z",
    code: { coding: [{ system: "http://loinc.org", code: "718-7" }] },
    valueQuantity: { value: 13.2, code: "g/dL", system: "http://unitsofmeasure.org" },
    meta: { source: origin + "/fhir" },
  } }],
}
function setup(overrides: Partial<USLongitudinalReadDependencies> = {}) {
  const calls: string[] = []
  const deps: USLongitudinalReadDependencies = {
    loadVerifiedContext: async () => {
      calls.push("context")
      return { exams, tasks, trustedOrigins: [origin] }
    },
    newAuditEventIds: () => ids,
    auditHmacKey: () => new Uint8Array(32).fill(7), // synthetic test only
    commitAuditPair: async events => {
      calls.push("audit:" + events.map(e => e.decision).join("+"))
      return { committed: true, eventIds: [events[0].eventId, events[1].eventId] }
    },
    readWithCurrentConsentAndRLS: async () => {
      calls.push("read")
      return { fhirBundle: bundle, followupTasks: [] }
    },
    ...overrides,
  }
  return { calls, deps }
}

Deno.test("both successful audit receipts precede reading any patient records", async () => {
  const { calls, deps } = setup()
  const result = await runUSAuditedLongitudinalRead(deps)
  assert.deepEqual(calls, ["context", "audit:allow+allow", "read"])
  assert.equal(result.permitted, true)
  if (!result.permitted) throw new Error("Unexpected denial")
  assert.equal(result.data.observationCount, 1)
  assert.equal(result.data.clinicalRiskAssessed, false)
})

Deno.test("revoked task permission logs both scope decisions and prevents PHI reads", async () => {
  const { calls, deps } = setup({
    loadVerifiedContext: async () => ({
      exams, tasks: { ...tasks, grants: [{ ...grant, revokedAt: "2026-10-24T00:00:00Z" }] },
      trustedOrigins: [origin],
    }),
  })
  const result = await runUSAuditedLongitudinalRead(deps)
  assert.equal(result.permitted, false)
  assert.deepEqual(calls, ["audit:allow+deny"])
})

Deno.test("broken durable audit acknowledgments prevent all reads", async () => {
  for (const response of [
    { committed: false as true, eventIds: ids },
    { committed: true as const, eventIds: [ids[0], ids[0]] as [string, string] },
  ]) {
    const { calls, deps } = setup({
      commitAuditPair: async () => response,
    })
    await assert.rejects(runUSAuditedLongitudinalRead(deps), /durably acknowledged/)
    assert.equal(calls.includes("read"), false)
  }
})

Deno.test("mismatched identities and duplicate audit IDs fail before accessing PHI", async () => {
  const a = setup({
    loadVerifiedContext: async () => ({
      exams, tasks: { ...tasks, actor: { ...tasks.actor, tenantId: "other-clinic" } },
      trustedOrigins: [origin],
    }),
  })
  await assert.rejects(runUSAuditedLongitudinalRead(a.deps), /Incompatible/)
  assert.equal(a.calls.includes("read"), false)
  const b = setup({ newAuditEventIds: () => [ids[0], ids[0]] })
  await assert.rejects(runUSAuditedLongitudinalRead(b.deps), /Distinct US audit IDs/)
  assert.equal(b.calls.includes("read"), false)
})

Deno.test("real-time consent changes at protected read must abort the entire view", async () => {
  const { calls, deps } = setup({
    readWithCurrentConsentAndRLS: async () => {
      calls.push("read_revalidation")
      throw new Error("Concurrent grant revoked")
    },
  })
  await assert.rejects(runUSAuditedLongitudinalRead(deps), /Concurrent grant revoked/)
  assert.deepEqual(calls, ["context", "audit:allow+allow", "read_revalidation"])
})
