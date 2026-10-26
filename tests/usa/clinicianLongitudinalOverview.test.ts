import assert from "node:assert/strict"
import { buildUSClinicianLongitudinalOverview } from "../../src/usa/clinicianLongitudinalOverview.ts"
import type { USClinicalAccessRequest, VerifiedUSClinicalGrant } from "../../src/usa/clinicalConsentPolicy.ts"
import type { USVerifiedFollowupTask } from "../../src/usa/clinicianFollowupQueue.ts"

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
const origin = "https://synthetic-hospital.example"
function observation(id: string, time: string) {
  return {
    resourceType: "Observation", id, status: "final",
    subject: { reference: "Patient/synthetic-patient" },
    effectiveDateTime: time,
    code: { coding: [{ system: "http://loinc.org", code: "718-7" }] },
    valueQuantity: { value: 13.2, code: "g/dL", system: "http://unitsofmeasure.org" },
    meta: { source: origin + "/fhir" },
  }
}
const fhir = {
  resourceType: "Bundle", type: "searchset",
  entry: [
    { resource: observation("old", "2026-10-04T00:00:00Z") },
    { resource: observation("new", "2026-10-24T00:00:00Z") },
  ],
}
const task: USVerifiedFollowupTask = {
  id: "review-1", patientId: "synthetic-patient", tenantId: "synthetic-clinic",
  clinicianId: "synthetic-physician", kind: "lab_review", status: "open",
  createdAt: "2026-10-20T00:00:00Z",
  dueAt: "2026-10-24T00:00:00Z",
}
const create = (
  ex: USClinicalAccessRequest = exams,
  tk: USClinicalAccessRequest = tasks,
  bundle: unknown = fhir,
) => buildUSClinicianLongitudinalOverview(bundle, [task], ex, tk, [origin])

Deno.test("physician receives chronological laboratory history and follow-up context, without clinical conclusions", () => {
  const view = create()
  assert.deepEqual(view.observations.map(o => o.id), ["new", "old"])
  assert.equal(view.observationCount, 2)
  assert.deepEqual(view.observationCodes, ["718-7"])
  assert.equal(view.followups.openTasks, 1)
  assert.equal(view.followups.overdueTasks, 1)
  assert.equal(view.clinicalRiskAssessed, false)
  assert.equal(view.syntheticOnly, true)
  assert.equal(view.observations.every(o => o.clinicalInterpretation === null), true)
})

Deno.test("cannot combine different patients, tenants, physicians or timestamps", () => {
  const variations: USClinicalAccessRequest[] = [
    { ...tasks, patientId: "different-patient" },
    { ...tasks, actor: { ...tasks.actor, tenantId: "different-clinic" } },
    { ...tasks, actor: { ...tasks.actor, userId: "different-physician" } },
    { ...tasks, serverNow: "2026-10-25T23:00:00Z" },
  ]
  for (const variation of variations) {
    assert.throws(() => create(exams, variation), /Incompatible US clinical identity/)
  }
})

Deno.test("revoking either independent scope prevents the entire combined overview", () => {
  assert.throws(() => create({
    ...exams, grants: [{ ...grant, scopes: ["clinical_tasks"] }],
  }), /FHIR access denied/)
  assert.throws(() => create(exams, {
    ...tasks, grants: [{ ...grant, revokedAt: "2026-10-24T00:00:00Z" }],
  }), /task access denied/)
})

Deno.test("cross-patient FHIR or task inputs cannot yield a partial longitudinal view", () => {
  assert.throws(() => create(exams, tasks, {
    resourceType: "Bundle", type: "searchset",
    entry: [{ resource: {
      ...observation("malicious", "2026-10-24T00:00:00Z"),
      subject: { reference: "Patient/other-patient" },
    } }],
  }))
  assert.throws(() => buildUSClinicianLongitudinalOverview(
    fhir, [{ ...task, tenantId: "other-clinic" }], exams, tasks, [origin],
  ))
})
