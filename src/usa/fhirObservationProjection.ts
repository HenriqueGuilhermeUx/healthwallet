/**
 * Health Wallet / MyDataMed USA: synthetic, patient-gated FHIR R4
 * Observation projection for a future clinician timeline.
 *
 * NOT a FHIR/US Core certification or an EHR connector. Requires a verified
 * US identity, clinical consent and tenant relationship from the SERVER.
 * Purposefully rejects data we cannot trace safely rather than guessing.
 */
import { evaluateUSClinicalAccess, type USClinicalAccessRequest } from "./clinicalConsentPolicy.ts"

export interface USClinicalObservation {
  resourceType: "Observation"
  id: string
  patientId: string
  loincCode: string
  status: "final" | "amended" | "corrected"
  effectiveAt: string
  numericValue: number
  ucumCode: string
  origin: string
  /** A clinical review is required; no AI diagnosis or normal/abnormal label. */
  clinicalInterpretation: null
}

function asObject(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Invalid FHIR resource")
  return v as Record<string, unknown>
}
function boundedString(v: unknown, max = 100): string {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw new Error("Invalid FHIR field")
  return v.trim()
}
function dateTime(s: unknown): number {
  if (typeof s !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s)) {
    throw new Error("Invalid FHIR timestamp")
  }
  const d = Date.parse(s)
  if (!Number.isFinite(d)) throw new Error("Invalid FHIR timestamp")
  return d
}
function sourceOrigin(s: unknown): string {
  if (typeof s !== "string") throw new Error("FHIR provenance missing")
  let url: URL
  try { url = new URL(s) } catch { throw new Error("Invalid FHIR provenance") }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid FHIR provenance")
  }
  return url.origin
}

/**
 * Only supports numeric LOINC-coded Observations with UCUM units in v1.
 * Other resources should use additional, separately audited adapters.
 */
export function projectAuthorizedFHIRObservations(
  bundle: unknown,
  request: USClinicalAccessRequest,
): USClinicalObservation[] {
  if (request.scope !== "exams" || !evaluateUSClinicalAccess(request).allowed) {
    throw new Error("FHIR access denied")
  }
  const root = asObject(bundle)
  if (root.resourceType !== "Bundle" || root.type !== "searchset" || !Array.isArray(root.entry) ||
      root.entry.length > 100) throw new Error("Invalid FHIR bundle")
  const observedNow = dateTime(request.serverNow)
  const ids = new Set<string>()
  return root.entry.map((entry: unknown) => {
    const resource = asObject(asObject(entry).resource)
    if (resource.resourceType !== "Observation") throw new Error("Unrecognized FHIR resource")
    const id = boundedString(resource.id)
    if (ids.has(id)) throw new Error("Duplicate Observation")
    ids.add(id)
    const patientRef = asObject(resource.subject).reference
    if (patientRef !== "Patient/" + request.patientId) {
      throw new Error("Cross-patient FHIR data blocked")
    }
    if (!["final", "amended", "corrected"].includes(String(resource.status))) {
      throw new Error("Unverified FHIR observation status")
    }
    const effective = boundedString(resource.effectiveDateTime, 60)
    if (dateTime(effective) > observedNow) throw new Error("Future FHIR observation")
    const code = asObject(resource.code)
    const codings = code.coding
    if (!Array.isArray(codings)) throw new Error("Missing FHIR code")
    const loinc = codings.find((c: unknown) => {
      try { return asObject(c).system === "http://loinc.org" } catch { return false }
    })
    if (!loinc) throw new Error("LOINC mapping not available")
    const loincCode = boundedString(asObject(loinc).code, 40)
    const quantity = asObject(resource.valueQuantity)
    if (quantity.system !== "http://unitsofmeasure.org" ||
      typeof quantity.value !== "number" || !Number.isFinite(quantity.value)) {
      throw new Error("Unsupported UCUM numeric observation")
    }
    const ucumCode = boundedString(quantity.code, 30)
    const origin = sourceOrigin(asObject(resource.meta).source)
    return {
      resourceType: "Observation" as const,
      id, patientId: request.patientId, loincCode,
      status: resource.status as USClinicalObservation["status"],
      effectiveAt: effective, numericValue: quantity.value,
      ucumCode, origin, clinicalInterpretation: null,
    }
  })
}
