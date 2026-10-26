import assert from "node:assert/strict"
import {
  runUSAuditedFollowupTransition,
  type USAuditedTaskWriteDependencies,
} from "../../src/usa/auditedFollowupMutation.ts"
import type { USRevisionedFollowupTask } from "../../src/usa/followupTransitionPolicy.ts"
import type { USClinicalAccessRequest, VerifiedUSClinicalGrant } from "../../src/usa/clinicalConsentPolicy.ts"

const auditEventId = "e4d694c2-e787-4f48-8e59-5d8a34d7b9ec"
const grant: VerifiedUSClinicalGrant = {
  patientId: "synthetic-patient", tenantId: "synthetic-clinic",
  practitionerId: "synthetic-doctor", purpose: "treatment",
  scopes: ["clinical_tasks"], issuedAt: "2026-10-01T00:00:00Z",
  expiresAt: "2026-11-01T00:00:00Z", revokedAt: null, version: "synthetic-v1",
}
const consentRequest: USClinicalAccessRequest = {
  actor: { userId: "synthetic-doctor", role: "clinician", tenantId: "synthetic-clinic" },
  patientId: "synthetic-patient", purpose: "treatment", scope: "clinical_tasks",
  serverNow: "2026-10-26T15:00:00Z", grants: [grant],
}
const task: USRevisionedFollowupTask = {
  id: "task-1", patientId: "synthetic-patient", tenantId: "synthetic-clinic",
  clinicianId: "synthetic-doctor", status: "open", kind: "lab_review",
  createdAt: "2026-10-20T00:00:00Z", dueAt: "2026-10-25T00:00:00Z",
  revision: 2,
}
const cmd = { taskId: "task-1", expectedRevision: 2, targetStatus: "in_progress" as const }
function setup(overrides: Partial<USAuditedTaskWriteDependencies> = {}) {
  const calls: string[] = []
  const deps: USAuditedTaskWriteDependencies = {
    loadTrustedContext: async () => {
      calls.push("verified_context")
      return { task, consentRequest }
    },
    newAuditEventId: () => auditEventId,
    commitTransitionAtomically: async (proposed, id) => {
      calls.push("commit_atomic")
      return {
        committed: true, affectedRows: 1,
        taskId: proposed.taskId, nextRevision: proposed.nextRevision,
        auditEventId: id,
      }
    },
    ...overrides,
  }
  return { calls, deps }
}
Deno.test("requires a server-reported single-row write and matching atomic audit", async () => {
  const { calls, deps } = setup()
  const result = await runUSAuditedFollowupTransition(cmd, deps)
  assert.deepEqual(calls, ["verified_context", "commit_atomic"])
  assert.deepEqual(result, {
    status: "SERVER_REPORTED_COMMITTED", taskId: task.id, nextRevision: 3,
    auditEventId, clinicalRiskAssessed: false,
    independentDatabaseVerificationComplete: false,
  })
  assert.equal(task.revision, 2)
  assert.equal(task.status, "open")
})

Deno.test("revoked clinician scope denies mutation before any writer is invoked", async () => {
  const { calls, deps } = setup({
    loadTrustedContext: async () => ({
      task, consentRequest: {
        ...consentRequest,
        grants: [{ ...grant, revokedAt: "2026-10-25T12:00:00Z" }],
      },
    }),
  })
  await assert.rejects(runUSAuditedFollowupTransition(cmd, deps), /access denied/)
  assert.deepEqual(calls, [])
})

Deno.test("stale revision or foreign task denies mutation before any writer", async () => {
  const { calls, deps } = setup()
  await assert.rejects(runUSAuditedFollowupTransition({
    ...cmd, expectedRevision: 1,
  }, deps), /Stale/)
  assert.equal(calls.includes("commit_atomic"), false)
  const other = setup({
    loadTrustedContext: async () => ({ task: { ...task, patientId: "other" }, consentRequest }),
  })
  await assert.rejects(runUSAuditedFollowupTransition(cmd, other.deps), /Stale/)
  assert.equal(other.calls.includes("commit_atomic"), false)
})

Deno.test("a partial, mismatched or duplicate audit acknowledgment is never accepted", async () => {
  const bad = [
    { committed: false as true, affectedRows: 1 as const, taskId: task.id, nextRevision: 3, auditEventId },
    { committed: true as const, affectedRows: 0 as 1, taskId: task.id, nextRevision: 3, auditEventId },
    { committed: true as const, affectedRows: 1 as const, taskId: task.id, nextRevision: 4, auditEventId },
    { committed: true as const, affectedRows: 1 as const, taskId: "wrong", nextRevision: 3, auditEventId },
    { committed: true as const, affectedRows: 1 as const, taskId: task.id, nextRevision: 3, auditEventId: "another-event" },
  ]
  for (const ack of bad) {
    const { deps } = setup({ commitTransitionAtomically: async () => ack })
    await assert.rejects(runUSAuditedFollowupTransition(cmd, deps), /acknowledgment not confirmed/)
  }
  const fail = setup({
    commitTransitionAtomically: async () => { throw new Error("Concurrent revision conflict") },
  })
  await assert.rejects(runUSAuditedFollowupTransition(cmd, fail.deps), /Concurrent revision conflict/)
})

Deno.test("malformed audit event IDs are denied before invoking the write adapter", async () => {
  const { calls, deps } = setup({ newAuditEventId: () => "user-supplied" })
  await assert.rejects(runUSAuditedFollowupTransition(cmd, deps), /Invalid server-generated/)
  assert.equal(calls.includes("commit_atomic"), false)
})
