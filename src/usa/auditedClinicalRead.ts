/**
 * MyDataMed USA — audit-before-read authorization boundary (REFERENCE ONLY).
 *
 * Server-side dependencies only. The request MUST be reconstructed by US
 * authentication + RLS, consent and tenant services, not received from a
 * browser as a supposedly "verified" object.
 *
 * The audit service must commit durably, using a unique event ID and
 * fail closed if storage is unavailable. DB-level source access must
 * independently recheck consent/revocation in one consistent transaction:
 * this pure orchestrator alone cannot prevent concurrent revocation races.
 */
import { evaluateUSClinicalAccess, type USClinicalAccessRequest } from "./clinicalConsentPolicy.ts"
import { createUSClinicalAuditEvent, type USClinicalAuditEvent } from "./clinicalAuditContract.ts"

export interface USAuditedClinicalReadDependencies<T> {
  /** Verified US actor, patient/clinic membership, single current grant. */
  loadVerifiedRequest(): Promise<USClinicalAccessRequest>
  /** Generated server-side; never client supplied. */
  newEventId(): string
  /** Server-only secret, never browser/VITE_ or logs. */
  getAuditHmacKey(): Uint8Array
  /**
   * Durable, append-only commitment. Acknowledgment must represent a
   * committed transaction; no best-effort logging or queue enqueue alone.
   */
  commitAudit(event: USClinicalAuditEvent): Promise<{ committed: true; eventId: string }>
  /** Server-side, RLS-protected read; MUST recheck current consent. */
  readProtectedData(request: USClinicalAccessRequest): Promise<T>
}

export type USAuditedClinicalReadResult<T> =
  | { permitted: false; reason: string; auditEventId: string }
  | { permitted: true; data: T; auditEventId: string }

export async function runUSClinicalReadWithAudit<T>(
  deps: USAuditedClinicalReadDependencies<T>,
): Promise<USAuditedClinicalReadResult<T>> {
  // A failed identity/consent lookup must never attempt the protected read.
  const request = await deps.loadVerifiedRequest()
  const decision = evaluateUSClinicalAccess(request)
  const eventId = deps.newEventId()
  const audit = await createUSClinicalAuditEvent(
    request, decision, eventId, deps.getAuditHmacKey(),
  )
  const proof = await deps.commitAudit(audit)
  if (!proof || proof.committed !== true || proof.eventId !== eventId) {
    throw new Error("US clinical audit durability not confirmed")
  }
  if (!decision.allowed) {
    return { permitted: false, reason: decision.reason, auditEventId: eventId }
  }
  // No PHI read until identity, consent and audit persistence have succeeded.
  const data = await deps.readProtectedData(request)
  return { permitted: true, data, auditEventId: eventId }
}
