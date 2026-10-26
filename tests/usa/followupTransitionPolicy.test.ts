import assert from "node:assert/strict"
import { planUSFollowupStatusChange, type USRevisionedFollowupTask } from "../../src/usa/followupTransitionPolicy.ts"
import type { USClinicalAccessRequest, VerifiedUSClinicalGrant } from "../../src/usa/clinicalConsentPolicy.ts"

const grant: VerifiedUSClinicalGrant = {
  patientId: "synthetic-patient-1", tenantId: "synthetic-clinic-1",
  practitionerId: "synthetic-doctor-1", purpose: "treatment",
  scopes: ["clinical_tasks"], issuedAt: "2026-10-01T00:00:00Z",
  expiresAt: "2026-11-30T00:00:00Z", revokedAt: null, version: "synthetic-v1",
}
const request: USClinicalAccessRequest = {
  actor: { userId: "synthetic-doctor-1", role: "clinician", tenantId: "synthetic-clinic-1" },
  patientId: "synthetic-patient-1", purpose: "treatment", scope: "clinical_tasks",
  serverNow: "2026-10-26T15:00:00Z", grants: [grant],
}
const task: USRevisionedFollowupTask = {
  id: "synthetic-task-1", patientId: "synthetic-patient-1",
  tenantId: "synthetic-clinic-1", clinicianId: "synthetic-doctor-1",
  kind: "lab_review", status: "open", createdAt: "2026-10-20T00:00:00Z",
  dueAt: "2026-10-25T00:00:00Z", revision: 3,
}
const command = { taskId: task.id, expectedRevision: 3, targetStatus: "in_progress" as const }

Deno.test("consented physician proposes transition with optimistic revision, but never writes to DB", () => {
  const result = planUSFollowupStatusChange(task, request, command)
  assert.deepEqual(result, {
    taskId: task.id, tenantId: task.tenantId, patientId: task.patientId,
    clinicianId: task.clinicianId, statusBefore: "open", statusAfter: "in_progress",
    expectedRevision: 3, nextRevision: 4, updatedAt: request.serverNow,
    persisted: false, clinicalRiskAssessed: false,
  })
  assert.equal(task.status, "open")
  assert.equal(task.revision, 3)
})

Deno.test("rejects competing writes and terminal task reopening", () => {
  assert.throws(() => planUSFollowupStatusChange(task, request, {
    ...command, expectedRevision: 2,
  }), /Stale/)
  for (const status of ["completed", "cancelled"] as const) {
    assert.throws(() => planUSFollowupStatusChange({ ...task, status }, request, command), /unsupported/)
  }
  assert.throws(() => planUSFollowupStatusChange({ ...task, status: "in_progress" }, request, {
    ...command, targetStatus: "in_progress",
  }), /unsupported/)
})

Deno.test("revoked consent and another doctor, patient or clinic block status mutation", () => {
  assert.throws(() => planUSFollowupStatusChange(task, {
    ...request, grants: [{ ...grant, revokedAt: "2026-10-25T00:00:00Z" }],
  }, command), /access denied/)
  for (const modified of [
    { patientId: "other-patient" },
    { tenantId: "other-clinic" },
    { clinicianId: "other-clinician" },
  ]) {
    assert.throws(() => planUSFollowupStatusChange({ ...task, ...modified }, request, command))
  }
})

Deno.test("rejects replayed revision, future task creation and unsupported status", () => {
  assert.throws(() => planUSFollowupStatusChange({ ...task, revision: Number.MAX_SAFE_INTEGER },
    request, { ...command, expectedRevision: Number.MAX_SAFE_INTEGER }), /Stale/)
  assert.throws(() => planUSFollowupStatusChange({ ...task, createdAt: "2026-10-27T00:00:00Z" },
    request, command), /chronology/)
  assert.throws(() => planUSFollowupStatusChange(task, request, {
    ...command, targetStatus: "auto_diagnosis" as "in_progress",
  }), /unsupported/)
})
