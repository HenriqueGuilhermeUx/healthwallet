/**
 * MyDataMed USA: server-only, two-scope clinical access and audit boundary.
 *
 * BOTH audits must be durably committed before fetching a combined clinical
 * payload. The storage callback MUST re-check both current grants in a single
 * consistent database authorization boundary (e.g. transaction).
 *
 * This is a dependency contract, not a live connection. No production keys,
 * patient data, transactions, EHR credentials or deploys are included.
 */
import { evaluateUSClinicalAccess, type USClinicalAccessRequest } from "./clinicalConsentPolicy.ts"
import { createUSClinicalAuditEvent, type USClinicalAuditEvent } from "./clinicalAuditContract.ts"
import {
  buildUSClinicianLongitudinalOverview,
  type USClinicianLongitudinalOverview,
} from "./clinicianLongitudinalOverview.ts"
import type { USVerifiedFollowupTask } from "./clinicianFollowupQueue.ts"

export interface USVerifiedLongitudinalContext {
  exams: USClinicalAccessRequest
  tasks: USClinicalAccessRequest
  trustedOrigins: readonly string[]
}

export interface USLongitudinalReadDependencies {
  /** Server verified, canonical identity and current patient consent grants. */
  loadVerifiedContext(): Promise<USVerifiedLongitudinalContext>
  /** Return two unique server-generated event UUIDs; no client input. */
  newAuditEventIds(): [string, string]
  /** Server-side rotating key, never exposed in browser configuration. */
  auditHmacKey(): Uint8Array
  /** Must durably commit BOTH unique IDs or reject; no queue-only ACK. */
  commitAuditPair(
    events: readonly [USClinicalAuditEvent, USClinicalAuditEvent],
  ): Promise<{ committed: true; eventIds: readonly [string, string] }>
  /**
   * Server-only DB/EHR read MUST independently re-check the two exact
   * grants, revocation and authenticated tenant at read time; fail closed
   * on races or changes. Any mismatch/errors must throw.
   */
  readWithCurrentConsentAndRLS(context: USVerifiedLongitudinalContext): Promise<{
    fhirBundle: unknown
    /**
     * ASSERTED by trusted server EHR transport adapter from actual TLS
     * response host, never taken from FHIR meta.source or browser input.
     */
    verifiedTransportOrigin: string
    followupTasks: readonly USVerifiedFollowupTask[]
  }>
}

export type USLongitudinalReadResult =
  | { permitted: false; auditEventIds: readonly [string, string]; reason: "SCOPE_DENIED" }
  | { permitted: true; auditEventIds: readonly [string, string]; data: USClinicianLongitudinalOverview }

export async function runUSAuditedLongitudinalRead(
  deps: USLongitudinalReadDependencies,
): Promise<USLongitudinalReadResult> {
  const context = await deps.loadVerifiedContext()
  const { exams, tasks } = context
  // Do not create an audit with cross-tenant/actor identity conflation.
  if (exams?.actor?.role !== "clinician" || tasks?.actor?.role !== "clinician" ||
      exams.scope !== "exams" || tasks.scope !== "clinical_tasks" ||
      !exams.actor.userId || exams.actor.userId !== tasks.actor.userId ||
      !exams.actor.tenantId || exams.actor.tenantId !== tasks.actor.tenantId ||
      !exams.patientId || exams.patientId !== tasks.patientId ||
      exams.purpose !== tasks.purpose || exams.serverNow !== tasks.serverNow) {
    throw new Error("Incompatible verified clinical identity contexts")
  }
  const examsPolicy = evaluateUSClinicalAccess(exams)
  const tasksPolicy = evaluateUSClinicalAccess(tasks)
  const ids = deps.newAuditEventIds()
  if (!Array.isArray(ids) || ids.length !== 2 || ids[0] === ids[1]) {
    throw new Error("Distinct US audit IDs required")
  }
  const key = deps.auditHmacKey()
  const events: [USClinicalAuditEvent, USClinicalAuditEvent] = [
    await createUSClinicalAuditEvent(exams, examsPolicy, ids[0], key),
    await createUSClinicalAuditEvent(tasks, tasksPolicy, ids[1], key),
  ]
  const ack = await deps.commitAuditPair(events)
  if (ack?.committed !== true || ack.eventIds?.length !== 2 ||
      ack.eventIds[0] !== ids[0] || ack.eventIds[1] !== ids[1]) {
    throw new Error("Clinical audit pair not durably acknowledged")
  }
  if (!examsPolicy.allowed || !tasksPolicy.allowed) {
    return { permitted: false, auditEventIds: ids, reason: "SCOPE_DENIED" }
  }
  // A real adapter MUST re-check consent/RLS *inside* this read. No pure
  // TypeScript policy can prove the absence of a revocation race.
  const payload = await deps.readWithCurrentConsentAndRLS(context)
  // FHIR resource.meta.source is UNTRUSTED resource content and can be
  // spoofed. Require a separately supplied server-trusted TLS transport
  // origin, pinned to the US provider registry. The resource metadata must
  // identify that very same origin, not merely any trusted provider.
  let transport: URL
  try {
    transport = new URL(payload.verifiedTransportOrigin)
  } catch {
    throw new Error("Unverified US FHIR transport origin")
  }
  if (transport.protocol !== "https:" || transport.origin !== payload.verifiedTransportOrigin ||
      transport.username || transport.password || transport.search || transport.hash ||
      !Array.isArray(context.trustedOrigins) ||
      !context.trustedOrigins.includes(payload.verifiedTransportOrigin)) {
    throw new Error("Unverified US FHIR transport origin")
  }
  const data = buildUSClinicianLongitudinalOverview(
    payload.fhirBundle, payload.followupTasks, exams, tasks, [payload.verifiedTransportOrigin],
  )
  return { permitted: true, data, auditEventIds: ids }
}
