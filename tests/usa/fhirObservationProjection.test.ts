import assert from "node:assert/strict"
import { projectAuthorizedFHIRObservations as projectRaw } from "../../src/usa/fhirObservationProjection.ts"
import type { USClinicalAccessRequest, VerifiedUSClinicalGrant } from "../../src/usa/clinicalConsentPolicy.ts"

const projectAuthorizedFHIRObservations = (bundle: unknown, request: USClinicalAccessRequest) =>
  projectRaw(bundle, request, ["https://clinic.example.com"])

const grant: VerifiedUSClinicalGrant = {
  patientId: "patient-123",
  tenantId: "clinic-1",
  practitionerId: "doctor-1",
  purpose: "treatment",
  scopes: ["exams"],
  issuedAt: "2026-09-01T00:00:00Z",
  expiresAt: "2026-11-01T00:00:00Z",
  revokedAt: null,
  version: "test",
}
const request: USClinicalAccessRequest = {
  actor: { userId: "doctor-1", tenantId: "clinic-1", role: "clinician" },
  patientId: "patient-123",
  scope: "exams",
  purpose: "treatment",
  serverNow: "2026-10-25T00:00:00Z",
  grants: [grant],
}
const observation = {
  resourceType: "Observation",
  id: "obs-001",
  status: "final",
  subject: { reference: "Patient/patient-123" },
  effectiveDateTime: "2026-10-20T10:00:00Z",
  code: { coding: [{ system: "http://loinc.org", code: "718-7" }] },
  valueQuantity: { value: 13.2, code: "g/dL", system: "http://unitsofmeasure.org" },
  meta: { source: "https://clinic.example.com/fhir" },
}
const bundle = (resource: unknown) => ({
  resourceType: "Bundle",
  type: "searchset",
  entry: [{ resource }],
})

Deno.test("clinician with explicit grant receives a traceable, non-interpretative projection", () => {
  const [row] = projectAuthorizedFHIRObservations(bundle(observation), request)
  assert.deepEqual(row, {
    resourceType: "Observation",
    id: "obs-001",
    patientId: "patient-123",
    loincCode: "718-7",
    status: "final",
    effectiveAt: "2026-10-20T10:00:00Z",
    numericValue: 13.2,
    ucumCode: "g/dL",
    origin: "https://clinic.example.com",
    clinicalInterpretation: null,
  })
})

Deno.test("grant revoked or expired blocks all FHIR data", () => {
  for (const changes of [
    { revokedAt: "2026-10-22T00:00:00Z" },
    { expiresAt: "2026-10-24T00:00:00Z" },
  ]) {
    assert.throws(() => projectAuthorizedFHIRObservations(bundle(observation), {
      ...request, grants: [{ ...grant, ...changes }],
    }), /FHIR access denied/)
  }
})

Deno.test("never projects a resource belonging to another patient, clinician or tenant", () => {
  assert.throws(() => projectAuthorizedFHIRObservations(bundle({
    ...observation, subject: { reference: "Patient/other-patient" },
  }), request), /Cross-patient/)
  assert.throws(() => projectAuthorizedFHIRObservations(bundle(observation), {
    ...request, actor: { ...request.actor, tenantId: "other-clinic" },
  }), /FHIR access denied/)
  assert.throws(() => projectAuthorizedFHIRObservations(bundle(observation), {
    ...request, actor: { ...request.actor, userId: "other-clinician" },
  }), /FHIR access denied/)
})

Deno.test("rejects untraceable observations, unsafe source URLs, unreviewed codes and duplicate IDs", () => {
  const invalid = [
    { ...observation, meta: { source: "https://clinic.example.com.evil.net" }, subject: { reference: "Patient/other" } },
    { ...observation, meta: { source: "http://insecure.example.com" } },
    { ...observation, meta: { source: "https://clinic.example.com.evil.net/fhir" } },
    { ...observation, code: { coding: [{ system: "unknown", code: "10" }] } },
    { ...observation, valueQuantity: { ...observation.valueQuantity, value: Number.NaN } },
    { ...observation, status: "preliminary" },
    { ...observation, effectiveDateTime: "2026-12-01T00:00:00Z" },
  ]
  for (const item of invalid) {
    assert.throws(() => projectAuthorizedFHIRObservations(bundle(item), request))
  }
  assert.throws(() => projectAuthorizedFHIRObservations({
    resourceType: "Bundle", type: "searchset",
    entry: [{ resource: observation }, { resource: observation }],
  }, request), /Duplicate Observation/)
})

Deno.test("FHIR resource categories are limited to Observation in this projection", () => {
  assert.throws(() => projectAuthorizedFHIRObservations(bundle({
    ...observation, resourceType: "MedicationRequest",
  }), request))
})
