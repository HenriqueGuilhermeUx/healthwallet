import assert from "node:assert/strict"
import { createUSClinicalAuditEvent } from "../../src/usa/clinicalAuditContract.ts"
import type { USClinicalAccessDecision, USClinicalAccessRequest } from "../../src/usa/clinicalConsentPolicy.ts"

const secret = new Uint8Array(32).fill(73) // SYNTHETIC ONLY, never a credential.
const eventId = "e4d694c2-e787-4f48-8e59-5d8a34d7b9ec"
const request: USClinicalAccessRequest = {
  actor: { userId: "synthetic-doctor-1", role: "clinician", tenantId: "synthetic-clinic-1" },
  patientId: "synthetic-patient-1",
  scope: "clinical_tasks", purpose: "treatment",
  serverNow: "2026-10-25T20:00:00Z", grants: [],
}
const allowed: USClinicalAccessDecision = { allowed: true, reason: "GRANTED" }

Deno.test("audit event contains opaque stable IDs and no medical payload or raw identity", async () => {
  const a = await createUSClinicalAuditEvent(request, allowed, eventId, secret)
  const b = await createUSClinicalAuditEvent(request, allowed, eventId, secret)
  assert.deepEqual(a, b)
  assert.equal(a.decision, "allow")
  assert.equal(a.containsMedicalPayload, false)
  assert.equal(a.principalPseudonym.length, 64)
  assert.equal(a.patientPseudonym.length, 64)
  assert.equal(a.tenantPseudonym.length, 64)
  assert.notEqual(a.principalPseudonym, a.patientPseudonym)
  const json = JSON.stringify(a)
  for (const forbidden of [request.actor.userId, request.patientId, request.actor.tenantId]) {
    assert.equal(json.includes(forbidden!), false)
  }
})

Deno.test("HMAC tenant domain separation prevents cross-clinic pseudonym linking", async () => {
  const x = await createUSClinicalAuditEvent(request, allowed, eventId, secret)
  const y = await createUSClinicalAuditEvent({
    ...request, actor: { ...request.actor, tenantId: "another-clinic" },
  }, allowed, eventId, secret)
  assert.notEqual(x.patientPseudonym, y.patientPseudonym)
  assert.notEqual(x.principalPseudonym, y.principalPseudonym)
})

Deno.test("denied access can be recorded without patient medical values", async () => {
  const x = await createUSClinicalAuditEvent(
    request, { allowed: false, reason: "NO_ACTIVE_CONSENT" }, eventId, secret,
  )
  assert.equal(x.decision, "deny")
  assert.equal(x.reason, "NO_ACTIVE_CONSENT")
})

Deno.test("rejects contradictory audit outcomes, weak secrets and non-server event IDs", async () => {
  await assert.rejects(createUSClinicalAuditEvent(
    request, { allowed: true, reason: "NO_ACTIVE_CONSENT" }, eventId, secret,
  ))
  await assert.rejects(createUSClinicalAuditEvent(request, allowed, eventId, new Uint8Array(16)))
  await assert.rejects(createUSClinicalAuditEvent(request, allowed, "user-provided", secret))
  await assert.rejects(createUSClinicalAuditEvent({
    ...request, serverNow: "2026-10-25",
  }, allowed, eventId, secret))
})
