/**
 * MyDataMed USA — clinician follow-up task state-change policy (PURE).
 *
 * This plans a task status transition but NEVER updates a database, sends a
 * message, triages a patient or makes a medical decision. A US backend must
 * independently verify identity and consent, durably audit the mutation, and
 * enforce an atomic revision compare-and-swap with tenant and patient RLS.
 */
import { evaluateUSClinicalAccess, type USClinicalAccessRequest } from "./clinicalConsentPolicy.ts"
import type { USVerifiedFollowupTask } from "./clinicianFollowupQueue.ts"

export interface USRevisionedFollowupTask extends USVerifiedFollowupTask {
  revision: number
}

export interface USFollowupStatusCommand {
  taskId: string
  expectedRevision: number
  targetStatus: "in_progress" | "completed" | "cancelled"
}

export interface USProposedFollowupTransition {
  taskId: string
  tenantId: string
  patientId: string
  clinicianId: string
  statusBefore: USVerifiedFollowupTask["status"]
  statusAfter: USFollowupStatusCommand["targetStatus"]
  expectedRevision: number
  nextRevision: number
  updatedAt: string
  /** No medical decision, actual DB write, or customer notification. */
  persisted: false
  clinicalRiskAssessed: false
}

function validUtcInstant(value: string): number {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) {
    throw new Error("Invalid server time")
  }
  const instant = Date.parse(value)
  if (!Number.isFinite(instant) ||
      new Date(instant).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw new Error("Invalid server time")
  }
  return instant
}
const transitions: Record<USVerifiedFollowupTask["status"], readonly string[]> = {
  open: ["in_progress", "completed", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
}

export function planUSFollowupStatusChange(
  task: USRevisionedFollowupTask,
  request: USClinicalAccessRequest,
  command: USFollowupStatusCommand,
): USProposedFollowupTransition {
  if (!request || request.actor?.role !== "clinician" ||
      request.scope !== "clinical_tasks" ||
      evaluateUSClinicalAccess(request).allowed !== true) {
    throw new Error("US clinical follow-up mutation access denied")
  }
  if (!task || !command || typeof task.id !== "string" || !task.id ||
      task.id !== command.taskId || task.patientId !== request.patientId ||
      task.tenantId !== request.actor.tenantId ||
      task.clinicianId !== request.actor.userId ||
      !Number.isSafeInteger(task.revision) || task.revision < 0 ||
      task.revision === Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(command.expectedRevision) ||
      command.expectedRevision !== task.revision ||
      !Object.prototype.hasOwnProperty.call(transitions, task.status) ||
      !transitions[task.status].includes(command.targetStatus)) {
    throw new Error("Stale, foreign or unsupported US follow-up transition")
  }
  const now = validUtcInstant(request.serverNow)
  const created = Date.parse(task.createdAt)
  const due = Date.parse(task.dueAt)
  if (!Number.isFinite(created) || !Number.isFinite(due) ||
      !/^(\d{4}-\d{2}-\d{2})T/.test(task.createdAt) ||
      created > now || due < created) {
    throw new Error("Invalid task chronology")
  }
  return {
    taskId: task.id, tenantId: task.tenantId, patientId: task.patientId,
    clinicianId: task.clinicianId, statusBefore: task.status,
    statusAfter: command.targetStatus, expectedRevision: task.revision,
    nextRevision: task.revision + 1, updatedAt: request.serverNow,
    persisted: false, clinicalRiskAssessed: false,
  }
}
