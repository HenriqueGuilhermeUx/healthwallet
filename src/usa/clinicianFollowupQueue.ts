/**
 * MyDataMed USA V1 - isolated clinician follow-up queue projection.
 *
 * This is a PURE, SYNTHETIC task read model; never creates appointments,
 * diagnoses patients, makes triage decisions or sends medical notifications.
 * The server must independently verify identity, grants, RLS and the task
 * record source. A web client must never construct a Verified grant.
 */
import { evaluateUSClinicalAccess, type USClinicalAccessRequest } from "./clinicalConsentPolicy.ts"

export type USFollowupKind =
  | "lab_review" | "routine_followup" | "medication_reconciliation" | "document_review"

export interface USVerifiedFollowupTask {
  id: string
  patientId: string
  tenantId: string
  clinicianId: string
  kind: USFollowupKind
  status: "open" | "in_progress" | "completed" | "cancelled"
  dueAt: string
  createdAt: string
}

export interface USFollowupSummary {
  patientId: string
  tenantId: string
  assignedClinicianId: string
  openTasks: number
  overdueTasks: number
  nextAction: { taskId: string, kind: USFollowupKind, dueAt: string } | null
  /** Deadline arithmetic, NOT a medical urgency or clinical risk indicator. */
  overdue: boolean
  clinicalRiskAssessed: false
}

function timestamp(value: unknown): number {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error("Invalid US task timestamp")
  }
  const day = new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))))
  if (day.toISOString().slice(0, 10) !== value.slice(0, 10)) throw new Error("Invalid US task calendar date")
  const result = Date.parse(value)
  if (!Number.isFinite(result)) throw new Error("Invalid US task timestamp")
  return result
}

/**
 * One verified clinician + one patient per projection. Access is denied
 * before any task is read. Mixed-tenant/patient payloads fail closed.
 */
export function projectUSPatientFollowups(
  tasks: readonly USVerifiedFollowupTask[],
  request: USClinicalAccessRequest,
): USFollowupSummary {
  if (request.actor?.role !== "clinician" || request.scope !== "clinical_tasks" ||
      !evaluateUSClinicalAccess(request).allowed) {
    throw new Error("US clinical task access denied")
  }
  if (!Array.isArray(tasks) || tasks.length > 500) throw new Error("Invalid task batch")
  const now = timestamp(request.serverNow)
  let openTasks = 0
  let overdueTasks = 0
  let next: { taskId: string, kind: USFollowupKind, dueAt: string, time: number } | null = null
  const ids = new Set<string>()
  for (const task of tasks) {
    if (!task || typeof task.id !== "string" || !task.id.trim() || ids.has(task.id) ||
        task.patientId !== request.patientId || task.tenantId !== request.actor.tenantId ||
        task.clinicianId !== request.actor.userId ||
        !["open", "in_progress", "completed", "cancelled"].includes(task.status) ||
        !["lab_review", "routine_followup", "medication_reconciliation", "document_review"].includes(task.kind)) {
      throw new Error("Invalid, duplicated or cross-tenant follow-up task")
    }
    ids.add(task.id)
    const due = timestamp(task.dueAt)
    const created = timestamp(task.createdAt)
    if (created > now || due < created) throw new Error("Invalid task chronology")
    if (task.status === "completed" || task.status === "cancelled") continue
    openTasks++
    if (due < now) overdueTasks++
    if (!next || due < next.time || (due === next.time && task.id < next.taskId)) {
      next = { taskId: task.id, kind: task.kind, dueAt: task.dueAt, time: due }
    }
  }
  return {
    patientId: request.patientId,
    tenantId: request.actor.tenantId!,
    assignedClinicianId: request.actor.userId,
    openTasks,
    overdueTasks,
    nextAction: next ? { taskId: next.taskId, kind: next.kind, dueAt: next.dueAt } : null,
    overdue: overdueTasks > 0,
    clinicalRiskAssessed: false,
  }
}
