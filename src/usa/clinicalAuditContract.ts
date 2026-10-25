/**
 * Alternative Ventures USA — minimum-necessary clinical access audit event.
 *
 * Pure, synthetic-safe formatter; NOT a persisted HIPAA audit system.
 * The backend must verify identity and policy inputs, own the HMAC key,
 * timestamp and event ID, and durably store events in a separate US service.
 * Pseudonyms can still be regulated health information; protect accordingly.
 */
import type { USClinicalAccessRequest, USClinicalAccessDecision } from "./clinicalConsentPolicy.ts"

export interface USClinicalAuditEvent {
  schemaVersion: "usa-clinical-audit-v1"
  eventId: string
  occurredAt: string
  principalPseudonym: string
  patientPseudonym: string
  tenantPseudonym: string
  actorRole: "patient" | "clinician" | "care_coordinator"
  purpose: "treatment" | "care_coordination"
  scope: string
  action: "clinical_read_attempt"
  decision: "allow" | "deny"
  reason: USClinicalAccessDecision["reason"]
  /** Intentionally no name, diagnosis, token, medical value or query content. */
  containsMedicalPayload: false
}

const HEX = /^[0-9a-fA-F-]{36}$/
function rejectInvalid(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.length > 160 ||
      /[\x00-\x1f]/.test(value)) throw new Error("Invalid " + label)
  return value
}
function verifiedTime(value: unknown): string {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !Number.isFinite(Date.parse(value))) throw new Error("Invalid audit timestamp")
  return value
}

export async function createUSClinicalAuditEvent(
  request: USClinicalAccessRequest,
  decision: USClinicalAccessDecision,
  eventId: string,
  serverHmacSecret: Uint8Array,
): Promise<USClinicalAuditEvent> {
  if (!request?.actor || !decision ||
      !["PATIENT_SELF", "GRANTED", "INVALID_IDENTITY", "INVALID_TIME", "NO_ACTIVE_CONSENT", "OUT_OF_SCOPE"].includes(decision.reason) ||
      typeof decision.allowed !== "boolean" ||
      decision.allowed !== ["PATIENT_SELF", "GRANTED"].includes(decision.reason) ||
      !(serverHmacSecret instanceof Uint8Array) || serverHmacSecret.byteLength < 32 ||
      !HEX.test(eventId) || eventId.length !== 36) throw new Error("Invalid audit input")

  const tenant = rejectInvalid(request.actor.tenantId || "patient-self", "US tenant")
  const actor = rejectInvalid(request.actor.userId, "actor")
  const patient = rejectInvalid(request.patientId, "patient")
  if (!["patient", "clinician", "care_coordinator"].includes(request.actor.role) ||
      !["treatment", "care_coordination"].includes(request.purpose)) {
    throw new Error("Invalid clinical audit identity")
  }
  const key = await crypto.subtle.importKey(
    "raw", serverHmacSecret.slice(), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  )
  const mac = async (kind: string, id: string) => {
    const data = new TextEncoder().encode("USA-AUDIT-V1|" + kind + "|" + tenant + "|" + id)
    const digest = await crypto.subtle.sign("HMAC", key, data)
    return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("")
  }
  return {
    schemaVersion: "usa-clinical-audit-v1",
    eventId,
    occurredAt: verifiedTime(request.serverNow),
    principalPseudonym: await mac("principal", actor),
    patientPseudonym: await mac("patient", patient),
    tenantPseudonym: await mac("tenant", tenant),
    actorRole: request.actor.role,
    purpose: request.purpose,
    scope: rejectInvalid(request.scope, "scope"),
    action: "clinical_read_attempt",
    decision: decision.allowed ? "allow" : "deny",
    reason: decision.reason,
    containsMedicalPayload: false,
  }
}
