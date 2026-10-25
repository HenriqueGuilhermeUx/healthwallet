/**
 * Alternative Ventures USA — patient-scoped consent POLICY CONTRACT.
 *
 * Pure evaluator for SYNTHETIC test inputs. Not wired to a database or UX.
 * The caller MUST cryptographically verify the identity, clinician membership,
 * grant provenance, patient identity and read-scope before passing records here.
 *
 * Terms acceptance or cached localStorage MUST NOT be treated as a clinical grant.
 */
export type USClinicalScope =
  | "summary" | "exams" | "medications" | "timeline"
  | "documents" | "device_data" | "clinical_tasks"

export interface VerifiedUSClinicalActor {
  userId: string
  role: "patient" | "clinician" | "care_coordinator"
  /** Verified by server: not JWT user_metadata nor browser state. */
  tenantId?: string
}

export interface VerifiedUSClinicalGrant {
  patientId: string
  tenantId: string
  practitionerId: string | null
  purpose: "treatment" | "care_coordination"
  scopes: USClinicalScope[]
  issuedAt: string
  expiresAt: string
  revokedAt: string | null
  version: string
}

export interface USClinicalAccessRequest {
  actor: VerifiedUSClinicalActor
  patientId: string
  scope: USClinicalScope
  purpose: "treatment" | "care_coordination"
  /**
   * Only use a server-side time source, never a timestamp supplied by the browser.
   * Must be a complete timestamp with explicit timezone, e.g. 2026-10-24T19:00:00Z.
   */
  serverNow: string
  grants: VerifiedUSClinicalGrant[]
}

export type USClinicalAccessDecision = {
  allowed: boolean
  reason: "PATIENT_SELF" | "GRANTED" | "INVALID_IDENTITY" | "INVALID_TIME" |
    "NO_ACTIVE_CONSENT" | "OUT_OF_SCOPE"
}

function instant(value: string): number | null {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function evaluateUSClinicalAccess(input: USClinicalAccessRequest): USClinicalAccessDecision {
  const { actor, patientId, scope, purpose, grants } = input
  const now = instant(input.serverNow)
  if (now === null) return { allowed: false, reason: "INVALID_TIME" }
  if (!actor?.userId || !patientId ||
      !["patient", "clinician", "care_coordinator"].includes(actor.role)) {
    return { allowed: false, reason: "INVALID_IDENTITY" }
  }
  // The scope decision is made for one requested resource category, no wildcards.
  if (!["summary", "exams", "medications", "timeline", "documents", "device_data", "clinical_tasks"].includes(scope)) {
    return { allowed: false, reason: "OUT_OF_SCOPE" }
  }
  // Patient self-access does not confer delegated physician access.
  if (actor.role === "patient") {
    return actor.userId === patientId
      ? { allowed: true, reason: "PATIENT_SELF" }
      : { allowed: false, reason: "INVALID_IDENTITY" }
  }
  if (!actor.tenantId || !Array.isArray(grants) || !["treatment", "care_coordination"].includes(purpose)) {
    return { allowed: false, reason: "INVALID_IDENTITY" }
  }
  // V1 requires one canonical, server-verified current grant per
  // patient/clinic/practitioner/purpose. Conflicting or stale grant snapshots
  // must never accidentally override a revocation.
  const matching = grants.filter(g =>
    g?.patientId === patientId && g.tenantId === actor.tenantId &&
    g.purpose === purpose && g.practitionerId === actor.userId
  )
  if (matching.length !== 1) return { allowed: false, reason: "NO_ACTIVE_CONSENT" }
  const g = matching[0]
  const issued = instant(g.issuedAt)
  const expiry = instant(g.expiresAt)
  const revoked = g.revokedAt == null ? null : instant(g.revokedAt)
  if (!g.version || issued === null || expiry === null ||
      (g.revokedAt !== null && revoked === null) || now < issued ||
      now >= expiry || (revoked !== null && now >= revoked)) {
    return { allowed: false, reason: "NO_ACTIVE_CONSENT" }
  }
  if (!Array.isArray(g.scopes) || !g.scopes.includes(scope)) {
    return { allowed: false, reason: "OUT_OF_SCOPE" }
  }
  return { allowed: true, reason: "GRANTED" }
}
