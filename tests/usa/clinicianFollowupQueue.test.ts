import assert from "node:assert/strict"
import { projectUSPatientFollowups, type USVerifiedFollowupTask } from "../../src/usa/clinicianFollowupQueue.ts"
import type { USClinicalAccessRequest, VerifiedUSClinicalGrant } from "../../src/usa/clinicalConsentPolicy.ts"

const grant: VerifiedUSClinicalGrant = {
  patientId: "synthetic-patient-1", tenantId: "synthetic-clinic-1",
  practitionerId: "synthetic-doctor-1", purpose: "treatment",
  scopes: ["clinical_tasks"], issuedAt: "2026-10-01T00:00:00Z",
  expiresAt: "2026-12-01T00:00:00Z", revokedAt: null, version: "v1",
}
const request: USClinicalAccessRequest = {
  actor: { userId: "synthetic-doctor-1", role: "clinician", tenantId: "synthetic-clinic-1" },
  patientId: "synthetic-patient-1", scope: "clinical_tasks", purpose: "treatment",
  serverNow: "2026-10-25T18:00:00Z", grants: [grant],
}
const task: USVerifiedFollowupTask = {
  id: "task-1", patientId: "synthetic-patient-1", tenantId: "synthetic-clinic-1",
  clinicianId: "synthetic-doctor-1", kind: "lab_review", status: "open",
  createdAt: "2026-10-20T00:00:00Z", dueAt: "2026-10-22T00:00:00Z",
}

Deno.test("assigned doctor sees deadline-only, consent-gated patient follow-up summary", () => {
  const view = projectUSPatientFollowups([
    task,
    { ...task, id: "task-2", status: "completed", dueAt: "2026-10-23T00:00:00Z" },
    { ...task, id: "task-3", kind: "routine_followup", dueAt: "2026-10-28T00:00:00Z" },
  ], request)
  assert.deepEqual(view, {
    patientId: "synthetic-patient-1", tenantId: "synthetic-clinic-1",
    assignedClinicianId: "synthetic-doctor-1", openTasks: 2, overdueTasks: 1,
    nextAction: { taskId: "task-1", kind: "lab_review", dueAt: "2026-10-22T00:00:00Z" },
    overdue: true, clinicalRiskAssessed: false,
  })
})

Deno.test("patient-level revocation and missing task scope stop projections", () => {
  assert.throws(() => projectUSPatientFollowups([task], {
    ...request, grants: [{ ...grant, revokedAt: "2026-10-24T00:00:00Z" }],
  }), /access denied/)
  assert.throws(() => projectUSPatientFollowups([task], {
    ...request, grants: [{ ...grant, scopes: ["exams"] }],
  }), /access denied/)
})

Deno.test("another clinic, another patient or another clinician cannot read tasks", () => {
  for (const changes of [
    { patientId: "other-patient" },
    { tenantId: "other-clinic" },
    { clinicianId: "other-doctor" },
  ]) {
    assert.throws(() => projectUSPatientFollowups([{ ...task, ...changes }], request))
  }
})

Deno.test("rejects stale, forged, duplicate, future and clinically unsupported tasks", () => {
  assert.throws(() => projectUSPatientFollowups([task, task], request))
  assert.throws(() => projectUSPatientFollowups([{ ...task, kind: "automatic-diagnosis" as "lab_review" }], request))
  assert.throws(() => projectUSPatientFollowups([{ ...task, createdAt: "2026-10-26T00:00:00Z" }], request))
  assert.throws(() => projectUSPatientFollowups([{ ...task, dueAt: "2026-02-30T00:00:00Z" }], request))
  assert.throws(() => projectUSPatientFollowups([{ ...task, dueAt: "2026-10-01T00:00:00Z" }], request))
})

Deno.test("empty clinical follow-up list shows no inferred clinical risk", () => {
  const view = projectUSPatientFollowups([], request)
  assert.deepEqual({ count: view.openTasks, overdue: view.overdue, risk: view.clinicalRiskAssessed }, {
    count: 0, overdue: false, risk: false,
  })
})
