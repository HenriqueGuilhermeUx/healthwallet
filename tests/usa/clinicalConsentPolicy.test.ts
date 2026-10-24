import assert from "node:assert/strict"
import {
  evaluateUSClinicalAccess,
  type VerifiedUSClinicalGrant,
  type USClinicalAccessRequest,
} from "../../src/usa/clinicalConsentPolicy.ts"

const now = "2026-10-24T19:00:00Z"
const grant: VerifiedUSClinicalGrant = {
  patientId: "us-patient-1",
  tenantId: "us-clinic-1",
  practitionerId: "us-clinician-1",
  purpose: "treatment",
  scopes: ["summary", "exams", "clinical_tasks"],
  issuedAt: "2026-10-01T10:00:00Z",
  expiresAt: "2026-11-30T20:00:00Z",
  revokedAt: null,
  version: "us-clinical-sharing-v1",
}
const template: USClinicalAccessRequest = {
  actor: { userId: "us-clinician-1", role: "clinician", tenantId: "us-clinic-1" },
  patientId: "us-patient-1",
  scope: "exams",
  purpose: "treatment",
  serverNow: now,
  grants: [grant],
}

Deno.test("physician sees only explicitly granted records in one US tenant", () => {
  assert.deepEqual(evaluateUSClinicalAccess(template), { allowed: true, reason: "GRANTED" })
  assert.equal(evaluateUSClinicalAccess({ ...template, scope: "device_data" }).allowed, false)
  assert.equal(evaluateUSClinicalAccess({ ...template, purpose: "care_coordination" }).allowed, false)
})

Deno.test("cross-patient, cross-clinic and wrong practitioner access are denied", () => {
  assert.equal(evaluateUSClinicalAccess({ ...template, patientId: "another-patient" }).allowed, false)
  assert.equal(evaluateUSClinicalAccess({ ...template, actor: { ...template.actor, tenantId: "us-clinic-2" } }).allowed, false)
  assert.equal(evaluateUSClinicalAccess({ ...template, actor: { ...template.actor, userId: "another-clinician" } }).allowed, false)
})

Deno.test("revoked, expired, future and malformed grants never authorize PHI", () => {
  const altered = [
    { ...grant, revokedAt: "2026-10-20T00:00:00Z" },
    { ...grant, expiresAt: "2026-10-01T00:00:00Z" },
    { ...grant, issuedAt: "2026-10-25T00:00:00Z" },
    { ...grant, expiresAt: "invalid-date" },
  ]
  for (const g of altered) {
    assert.equal(evaluateUSClinicalAccess({ ...template, grants: [g] }).allowed, false)
  }
  assert.equal(evaluateUSClinicalAccess({ ...template, serverNow: "2026-10-24" }).allowed, false)
})

Deno.test("self-service access cannot impersonate a linked patient", () => {
  assert.deepEqual(evaluateUSClinicalAccess({
    ...template, actor: { userId: "us-patient-1", role: "patient" }, grants: [],
  }), { allowed: true, reason: "PATIENT_SELF" })
  assert.equal(evaluateUSClinicalAccess({
    ...template, actor: { userId: "other-patient", role: "patient" }, grants: [],
  }).allowed, false)
})

Deno.test("unverified clinician tenant never authorizes access", () => {
  assert.equal(evaluateUSClinicalAccess({
    ...template, actor: { userId: "us-clinician-1", role: "clinician" },
  }).allowed, false)
})

Deno.test("a grant without a specifically linked practitioner cannot authorize every clinician in a clinic", () => {
  assert.equal(evaluateUSClinicalAccess({
    ...template, grants: [{ ...grant, practitionerId: null }],
  }).allowed, false)
})
