/**
 * MyDataMed USA — isolated physician longitudinal overview (SYNTHETIC ONLY).
 *
 * Composes two independently authorized projections. The US server MUST
 * execute under an already committed audit and recheck current consent/RLS
 * at the record-read transaction. No direct browser use or real PHI storage.
 *
 * NO diagnosis, reference-range analysis, symptom triage, alerts or AI advice.
 */
import { projectAuthorizedFHIRObservations, type USClinicalObservation } from "./fhirObservationProjection.ts"
import { projectUSPatientFollowups, type USVerifiedFollowupTask, type USFollowupSummary } from "./clinicianFollowupQueue.ts"
import type { USClinicalAccessRequest } from "./clinicalConsentPolicy.ts"

export interface USClinicianLongitudinalOverview {
  patientId: string
  tenantId: string
  practitionerId: string
  observations: USClinicalObservation[]
  observationCount: number
  observationCodes: string[]
  followups: USFollowupSummary
  clinicalRiskAssessed: false
  syntheticOnly: true
}

export function buildUSClinicianLongitudinalOverview(
  examsBundle: unknown,
  followupTasks: readonly USVerifiedFollowupTask[],
  examsRequest: USClinicalAccessRequest,
  tasksRequest: USClinicalAccessRequest,
  trustedOrigins: readonly string[],
): USClinicianLongitudinalOverview {
  // Before projections, assert both grants are for the EXACT same verified
  // actor, US clinic, patient, purpose and server time. Never combine PHI
  // under two different identities or inconsistent consent snapshots.
  if (!examsRequest || !tasksRequest ||
      examsRequest.scope !== "exams" || tasksRequest.scope !== "clinical_tasks" ||
      examsRequest.actor?.role !== "clinician" || tasksRequest.actor?.role !== "clinician" ||
      !examsRequest.actor.userId ||
      examsRequest.actor.userId !== tasksRequest.actor.userId ||
      !examsRequest.actor.tenantId ||
      examsRequest.actor.tenantId !== tasksRequest.actor.tenantId ||
      !examsRequest.patientId || examsRequest.patientId !== tasksRequest.patientId ||
      examsRequest.purpose !== tasksRequest.purpose ||
      examsRequest.serverNow !== tasksRequest.serverNow) {
    throw new Error("Incompatible US clinical identity or consent contexts")
  }

  // Both functions fail closed on grant revocation, scope mismatch, mixed
  // tenants/patients and malformed records. Never display partial results
  // when either clinical scope was not independently authorized.
  const observations = projectAuthorizedFHIRObservations(examsBundle, examsRequest, trustedOrigins)
  const followups = projectUSPatientFollowups(followupTasks, tasksRequest)

  const ordered = [...observations].sort((a, b) => {
    const timeDiff = Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt)
    return timeDiff || a.id.localeCompare(b.id)
  })
  // Only list standard identifiers; do not infer medical interpretation
  // or combine different UCUM units as interchangeable.
  const codes = [...new Set(ordered.map(o => o.loincCode))].sort()
  return {
    patientId: examsRequest.patientId,
    tenantId: examsRequest.actor.tenantId,
    practitionerId: examsRequest.actor.userId,
    observations: ordered,
    observationCount: ordered.length,
    observationCodes: codes,
    followups,
    clinicalRiskAssessed: false,
    syntheticOnly: true,
  }
}
