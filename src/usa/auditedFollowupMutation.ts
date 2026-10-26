/**
 * MyDataMed USA — audited, compare-and-swap follow-up mutation CONTRACT.
 *
 * NOT an implemented database transaction. All adapters must be trusted
 * US server-side implementations: current identity, live consent, task RLS,
 * and append-only audit must be checked/written atomically at commit time.
 * Never invoke from browser or from a client-supplied "verified" task.
 */
import type { USClinicalAccessRequest } from "./clinicalConsentPolicy.ts"
import {
  planUSFollowupStatusChange,
  type USFollowupStatusCommand,
  type USRevisionedFollowupTask,
  type USProposedFollowupTransition,
} from "./followupTransitionPolicy.ts"

export interface USAuditedTaskWriteDependencies {
  /** Resolved from US auth + clinic membership, not request JSON. */
  loadTrustedContext(): Promise<{
    task: USRevisionedFollowupTask
    consentRequest: USClinicalAccessRequest
  }>
  /** Generated on server; unique in an append-only tenant audit ledger. */
  newAuditEventId(): string
  /**
   * MUST be ONE US DB transaction: recheck fresh consent/tenant/RLS;
   * UPDATE ... WHERE revision=expectedRevision returning one row;
   * append immutable audit row; COMMIT both or neither.
   * False/stale/duplicate/partial commits MUST throw or reject.
   */
  commitTransitionAtomically(
    proposed: USProposedFollowupTransition,
    auditEventId: string,
  ): Promise<{
    committed: true
    affectedRows: 1
    taskId: string
    nextRevision: number
    auditEventId: string
  }>
}

export interface USAuditedTaskWriteReceipt {
  status: "SERVER_REPORTED_COMMITTED"
  taskId: string
  nextRevision: number
  auditEventId: string
  clinicalRiskAssessed: false
  /** Unit tests alone never establish persistence, RLS, or clinical compliance. */
  independentDatabaseVerificationComplete: false
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/

export async function runUSAuditedFollowupTransition(
  command: USFollowupStatusCommand,
  deps: USAuditedTaskWriteDependencies,
): Promise<USAuditedTaskWriteReceipt> {
  const context = await deps.loadTrustedContext()
  const proposed = planUSFollowupStatusChange(context.task, context.consentRequest, command)
  const auditEventId = deps.newAuditEventId()
  if (!UUID.test(auditEventId)) throw new Error("Invalid server-generated task audit event ID")
  const ack = await deps.commitTransitionAtomically(proposed, auditEventId)
  if (!ack || ack.committed !== true || ack.affectedRows !== 1 ||
      ack.taskId !== proposed.taskId || ack.nextRevision !== proposed.nextRevision ||
      ack.auditEventId !== auditEventId) {
    throw new Error("Atomic task revision and audit acknowledgment not confirmed")
  }
  return {
    status: "SERVER_REPORTED_COMMITTED",
    taskId: proposed.taskId, nextRevision: proposed.nextRevision,
    auditEventId,
    clinicalRiskAssessed: false, independentDatabaseVerificationComplete: false,
  }
}
