# HealthWallet Concierge — Validation Plan

This document is the release gate for the Concierge MVP. Nothing in this branch is published to the public HealthWallet site/app or applied to the production database until this matrix passes in a controlled validation environment.

## 1. Migration order

Apply manually, in this exact order:

1. `SQL_CONCIERGE_MVP_V1.sql`
2. `SQL_CONCIERGE_PILOT_ANALYTICS_V1.sql`
3. `SQL_CONCIERGE_AUTOMATION_GUARDS_V1.sql`
4. `SQL_CONCIERGE_CONSENT_V1.sql`
5. `SQL_CONCIERGE_ROSTER_GUARDS_V1.sql`
6. `SQL_CONCIERGE_PROGRAM_GUARDS_V1.sql`
7. `SQL_CONCIERGE_ALERT_ENGINE_V1.sql`
8. `SQL_CONCIERGE_ALERT_CONSENT_GUARD_V1.sql`
9. `SQL_CONCIERGE_CLINICAL_REVIEW_V1.sql`
10. `SQL_CONCIERGE_REQUEST_CONTEXT_V1.sql`

All migrations are validation-first and are intentionally not executed by CI.

## 2. Test personas

Use separate authenticated accounts:

- Patient A — enrolled, with health plan
- Patient B — enrolled, without health plan
- Patient C — not enrolled
- Nurse A — `concierge_staff.role = nurse`
- Nurse B — another nurse, not assigned to Patient A
- Doctor A — `concierge_staff.role = doctor`
- Doctor B — another doctor, not assigned to Patient A
- Coordinator — `concierge_staff.role = care_coordinator`
- Admin — `concierge_staff.role = admin`

Never use real production health data in the validation matrix. Use synthetic/demo records only.

## 3. Enrollment and consent

### 3.1 Not enrolled

Patient C opens `/concierge`.

Expected:
- sees controlled-pilot state
- cannot create requests
- no additional professional data access is granted

### 3.2 Enrolled but consent pending

Coordinator enrolls Patient A through `/concierge/ops/roster`.

Expected:
- membership is created with `consent_status = pending`
- opening patient Concierge redirects to `/concierge/consent`
- Nurse A, Doctor A, Coordinator and Admin cannot use request-scoped clinical context before consent

### 3.3 Accept consent

Patient A reviews scopes and accepts.

Expected:
- `consent_status = accepted`
- version and timestamp are recorded
- immutable event appears in `concierge_consent_events`
- patient can enter Concierge

### 3.4 Revoke consent

Patient A revokes consent.

Expected:
- status becomes `revoked`
- membership is paused
- revocation event is recorded
- professional access through `concierge_can_access_patient` and `concierge_can_access_request` stops immediately
- open proactive alerts are dismissed
- no new Concierge alerts are accepted while consent is inactive
- patient can re-authorize later

## 4. Care-team assignment

Coordinator assigns Nurse A and Doctor A to Patient A.

Expected:
- both appear in patient `Minha Equipe`
- replacing Nurse A with Nurse B ends the previous primary nursing assignment
- replacing Doctor A with Doctor B ends the previous primary physician assignment
- no patient has two active primary professionals for the same care layer after replacement
- ordinary nurses/doctors cannot administer the roster

## 5. Patient request flows

### 5.1 Routine guidance

Patient creates a guidance request.

Expected:
- trackable request is created
- patient timeline has `request_created`
- automation event contains IDs/category/urgency, not raw health text
- assigned reference nurse receives the request

### 5.2 Symptom — no red flag

Patient reports a symptom without red flags.

Expected:
- urgency is routine/priority according to intake
- no diagnostic claim is generated automatically
- nurse owns first coordination step

### 5.3 Symptom — red flag

Patient marks severe warning signs.

Expected:
- UI instructs the patient to seek urgent care immediately
- request may be registered as `urgent_redirect`
- product does not promise emergency response
- patient is never instructed to wait for Concierge

### 5.4 Family request

Patient selects an existing `family_members` profile.

Expected:
- request stores `subject_family_member_id`
- no duplicate family profile is created
- subject name/relationship remain available for operational readability

## 6. Exam review and second analysis

Patient creates `exam_review` or `second_analysis` and selects existing HealthWallet exams.

Expected:
- files remain in `medical_records`; no duplicate upload is created
- request snapshot stores only linked exam references
- professional request-context RPC returns only the exams explicitly linked to that request and only when exam scope is authorized
- no raw storage URL is returned by the request-context RPC

### Nurse preparation

Nurse opens the case and prepares structured review.

Expected:
- can save draft
- can mark ready for physician
- cannot publish final patient-visible clinical review

### Physician completion

Doctor receives escalated review.

Expected:
- doctor can review structured context
- doctor can complete and publish
- completed review is visible to patient inside the case
- completion creates patient timeline event
- case can move into action-plan state

## 7. Request-scoped professional context

Professional explicitly clicks `Carregar contexto autorizado`.

Expected:
- access is on-demand, not automatic on every case page load
- access requires active patient consent
- only authorized request context is returned
- access is recorded in `concierge_context_access_logs`
- Nurse B / Doctor B cannot load Patient A context unless assigned/eligible under the routing rules
- revoking consent causes subsequent context loads to fail

## 8. Action plan

Nurse/doctor creates an action from a case.

Expected:
- action appears in patient `/concierge/plan`
- case moves to `action_plan` when appropriate
- patient can mark completion/reopen
- patient cannot rewrite title, due date, category, creator, assignment or operational metadata
- overdue action can generate a workflow alert after alert refresh

## 9. Programs

### Self-service programs

Patient enrolls in an `enrollment_mode = self` program after consent.

Expected:
- enrollment is unique per patient/program
- default goals are copied to enrollment
- default checklist generates actions once
- re-running/duplicate logic does not duplicate generated checklist actions
- patient without active consent cannot self-enroll

### Team-started programs

Validate hypertension, diabetes and pregnancy as `enrollment_mode = team`.

Expected:
- patient cannot directly self-enroll
- patient UI routes them to discuss the program with the care team
- assigned staff can enroll the patient when appropriate
- enrollment records `assigned_by`
- patient may later pause/cancel their own participation without rewriting assignment metadata

## 10. Alerts

Validate at least:
- overdue action
- request without first response
- follow-up due
- new exam signal
- meaningful MedScore change
- stale device synchronization signal

Expected:
- alerts are workflow attention signals, not diagnoses
- assigned staff/coordinator sees only authorized patients
- doctor queue remains focused on escalated medical review rather than every operational alert
- no new alert survives insertion after consent has been revoked
- revocation dismisses outstanding Concierge alerts for that patient

## 11. Workload and pilot economics

For synthetic interactions record human work minutes.

Expected metrics:
- active patients
- requests/member
- human minutes/member
- nurse/coordinator minutes
- physician minutes
- physician escalation rate
- first-response time
- resolution time
- with-plan vs without-plan segmentation

No pricing decision should be hard-coded from test data.

## 12. Security / privacy negative tests

Must fail:
- patient reading another patient's request
- patient reading staff-only case notes
- non-staff opening professional queue data
- nurse reading a patient with no assignment/eligible unassigned case
- doctor reading a non-escalated case not assigned to them
- coordinator clinical context access after patient revocation
- patient editing clinical review directly
- nurse publishing patient-visible final clinical review
- request-context RPC returning an unlinked exam
- patient self-enrolling into a team-started clinical program
- creation of proactive alert after consent revocation

## 13. Regression checks

The Concierge branch must not break:
- HealthWallet login/consent
- Dashboard
- Exams/upload
- Medications
- Family
- MedScore
- Telemedicine
- Care Links
- Device Data
- HealthWallet Connect return bridge

The main HealthWallet Android Health Connect permission strategy remains unchanged. Concierge development must not broaden the protected main-app Health Connect permission set.

## 14. Definition of validation success

The MVP is ready for a controlled pilot only when:

- latest branch CI is green
- migrations apply cleanly in validation
- all role-access negative tests pass
- patient consent/revocation works end-to-end
- patient → nurse → physician → patient second-analysis flow passes
- action-plan recurrence passes
- workload metrics are recorded
- HealthWallet existing features regress cleanly

Only after this gate do we decide when/how to publish the site/app experience.
