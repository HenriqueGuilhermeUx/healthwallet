# HealthWallet Concierge — Validation Plan

This document is the release gate for the Concierge MVP. Nothing in this branch is published to the public HealthWallet site/app or applied to the production database until this matrix passes in a controlled validation environment.

The deterministic execution sequence is documented in `HEALTH_CONCIERGE_E2E_RUNBOOK.md`.

## 1. Migration order

Apply manually, in this exact order:

1. `SQL_CONCIERGE_MVP_V1.sql`
2. `SQL_CONCIERGE_PILOT_ANALYTICS_V1.sql`
3. `SQL_CONCIERGE_AUTOMATION_GUARDS_V1.sql`
4. `SQL_CONCIERGE_CONSENT_V1.sql`
5. `SQL_CONCIERGE_ROSTER_GUARDS_V1.sql`
6. `SQL_CONCIERGE_REQUEST_INTEGRITY_V1.sql`
7. `SQL_CONCIERGE_PROGRAM_GUARDS_V1.sql`
8. `SQL_CONCIERGE_ALERT_ENGINE_V1.sql`
9. `SQL_CONCIERGE_ALERT_CONSENT_GUARD_V1.sql`
10. `SQL_CONCIERGE_CLINICAL_REVIEW_V1.sql`
11. `SQL_CONCIERGE_REQUEST_CONTEXT_V1.sql`
12. `SQL_CONCIERGE_PATIENT_AUDIT_V1.sql`
13. `SQL_CONCIERGE_SLA_METRICS_V1.sql`
14. `SQL_CONCIERGE_PATIENT_REPLY_ROUTING_V1.sql`
15. `SQL_CONCIERGE_REFERENCE_TEAM_ROUTING_V1.sql`

Then run `SQL_CONCIERGE_VALIDATION_PRECHECK_V1.sql`. It must return `PASS` before any E2E testing begins.

After the nine synthetic Auth users listed in `HEALTH_CONCIERGE_E2E_RUNBOOK.md` exist, run `SQL_CONCIERGE_VALIDATION_SEED_V1.sql`. It must also return `PASS`.

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

Coordinator enrolls Patient A through `/concierge/ops/roster` or the validation seed creates the pending membership.

Expected:
- membership exists with `consent_status = pending`
- opening patient Concierge redirects to `/concierge/consent`
- Nurse A, Doctor A, Coordinator and Admin cannot use request-scoped clinical context before consent

### 3.3 Accept consent

Patient A reviews scopes and accepts.

Expected:
- `consent_status = accepted`
- version and timestamp are recorded
- immutable event appears in `concierge_consent_events`
- patient can enter Concierge

### 3.4 Patient-visible access trail

After a professional explicitly loads authorized context, Patient A opens `/concierge/consent`.

Expected:
- patient can see professional display name/role, date and related case reference
- access is resolved through `concierge_list_my_context_accesses()` rather than exposing staff tables directly
- no clinical content is duplicated into the audit entry

### 3.5 Revoke consent

Patient A revokes consent.

Expected:
- status becomes `revoked`
- membership is paused
- revocation event is recorded
- professional access through `concierge_can_access_patient` and `concierge_can_access_request` stops immediately
- open proactive alerts are dismissed
- no new Concierge alerts are accepted while consent is inactive
- subsequent request-context loads fail
- patient reply through the Concierge RPC fails while consent is inactive
- patient can re-authorize later

## 4. Care-team assignment and continuity routing

Coordinator assigns Nurse A and Doctor A to Patient A.

Expected:
- both appear in patient `Minha Equipe`
- replacing Nurse A with Nurse B ends the previous primary nursing assignment
- replacing Doctor A with Doctor B ends the previous primary physician assignment
- no patient has two active primary professionals for the same care layer after replacement
- ordinary nurses/doctors cannot administer the roster

### 4.1 New-request routing

Patient A creates a new Concierge case while Nurse A is the active primary nurse.

Expected:
- request is created with `assigned_nurse_id = Nurse A`
- Nurse B does not become owner of the assigned case
- if no active primary nurse/care coordinator exists, the request may remain unassigned for the eligible fallback queue

### 4.2 Medical escalation routing

Nurse A escalates Patient A's case while Doctor A is the active primary physician.

Expected:
- `assigned_doctor_id = Doctor A`
- Doctor B is not assigned automatically
- if no active primary physician exists, the case may remain unassigned in the eligible medical fallback queue
- Nurse A cannot arbitrarily assign another physician
- Doctor A cannot alter the nursing assignment

## 5. Patient request flows

### 5.1 Routine guidance

Patient creates a guidance request.

Expected:
- trackable request is created
- patient timeline has `request_created`
- automation event contains IDs/category/urgency, not raw health text
- reference-team routing is applied
- original patient-authored title/description/category/context cannot be rewritten later by staff

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
- entering from Concierge Family preserves the selected family context into the tracked request

### 5.5 Request integrity / role transitions

Expected:
- nurse cannot assign a case to another nurse directly
- doctor cannot assign a case to another doctor directly
- nurse cannot arbitrarily assign a non-reference doctor
- doctor cannot rewrite the nursing assignment
- nurse cannot put a request into doctor-only arbitrary states
- doctor cannot move a request back into nurse-only arbitrary states
- admin/coordinator remains the operational override layer

### 5.6 Patient reply routing

Put one nurse-owned case and one physician-owned case into `waiting_patient`, then reply as the patient.

Expected:
- reply is written atomically through `concierge_patient_reply()`
- raw reply text is not copied into the automation queue
- nurse-owned case returns to `waiting_nurse`
- physician-owned case returns to `medical_review`
- closed/resolved case rejects new reply through the RPC
- revoked/pending consent rejects reply through the RPC
- patient cannot directly rewrite any other request field or status

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
- patient can see the resulting access trail in consent controls

### 7.1 MyDataMed operational patient workspace

Coordinator/reference staff opens `/concierge/ops/patient/:patientId`.

Expected:
- workspace shows operational state only: membership/consent, care team, cases, actions and alerts
- workspace does not query or render blanket `medical_records`, `health_scores`, `health_daily_summaries`, medications or full clinical timeline
- clinical context still requires opening an authorized request and explicitly loading request-scoped context
- patient context access remains auditable

## 8. Action plan

Nurse/doctor creates an action from a case.

Expected:
- action appears in patient `/concierge/plan`
- case moves to `action_plan` when appropriate
- patient can mark completion/reopen
- patient cannot rewrite title, due date, category, creator, assignment or operational metadata
- overdue action can generate a workflow alert after alert refresh

## 9. Agenda

Patient opens `/concierge/agenda`.

Expected:
- pending Concierge actions, telemedicine appointments and HealthWallet reminders are combined
- no second appointment/reminder table is created
- overdue action is visually identified
- links return to the canonical HealthWallet/Concierge source of each item

## 9.1 Longitudinal My Health

Patient opens `/concierge/health` with synthetic MedScore and device summaries, then repeat with no device data.

Expected:
- page reuses canonical HealthWallet `health_scores`, `health_daily_summaries`, `medical_records`, `medications` and `medical_events`
- no duplicate longitudinal-health table is created
- current MedScore and prior-score delta render when available
- 7-day steps/sleep/resting-heart-rate/weight trends compare with the previous 7-day window only when data exists
- pressure, SpO2, activity minutes and active calories are presented as recorded context, not diagnosis
- zero-device state renders without failure and points to the existing device flow
- user can navigate back to canonical Exams, Medications, Timeline, Passport and Device Data
- wording explicitly states device signals are complementary and do not create an automatic diagnosis
- main HealthWallet Health Connect permission architecture remains unchanged

## 9.2 Family coordination cockpit

Patient opens `/concierge/family` with synthetic existing family profiles.

Expected:
- profiles come from canonical `family_members`; no duplicate family record is created
- active family-targeted medications and reminders are summarized by `target_family_member_id`
- overdue reminders may be highlighted as operational attention, not a medical-risk score
- if no family profile exists, CTA returns to canonical HealthWallet Family setup
- requesting help enters the normal tracked Concierge case flow with the selected member preserved
- Concierge does not fabricate a Health Score for a family member without a real authorized longitudinal record

## 10. Programs

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

## 11. Alerts

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
- operations can open the related patient workspace
- authorized operations can acknowledge an alert
- authorized operations can resolve/dismiss an alert
- resolved/dismissed alerts leave the open queue
- no new alert survives insertion after consent has been revoked
- revocation dismisses outstanding Concierge alerts for that patient

## 12. SLA instrumentation

Create a new case and perform the first professional interaction.

Expected:
- `first_response_at` stays null while only patient/system events exist
- first staff status transition away from `new` records `first_response_at`
- first staff event also records `first_response_at` if status intentionally remains unchanged
- later interactions never overwrite the original first-response timestamp
- historical cases are not automatically backfilled with invented timestamps

## 13. Workload and pilot economics

For synthetic interactions, record human work minutes consistently.

Expected overall metrics:
- active patients
- requests/patient
- human minutes/patient
- nurse/coordinator minutes
- physician minutes
- physician escalation rate
- first-response time
- resolution time

Expected `with plan` vs `without plan` comparison for each group:
- patient count
- requests/patient
- engaged-patient rate
- repeat-use rate
- human minutes/patient
- nurse/coordinator minutes/patient
- physician minutes/patient
- physician escalation rate
- resolution rate

Expected data-quality indicators:
- health-plan profile coverage
- first-response timestamp coverage
- work-log coverage by request
- resolution timestamp coverage

Interpretation rules:
- only active/pilot memberships belong in current pilot economics
- low data coverage is an instrumentation warning, not a product-performance conclusion
- group differences are observational; they do not prove that health-plan status causes higher/lower usage
- no pricing decision is hard-coded from test data

## 14. AI assist — dormant safety gate

The branch contains a server-side foundation for future internal AI case organization, but it is not considered an active MVP feature yet.

Until explicit patient opt-in is available end-to-end:
- `consent_scope.ai_assist` remains absent/false by default
- the server function must return `AI_ASSIST_CONSENT_REQUIRED`
- no patient-facing button or professional workflow should depend on AI
- no AI output may change request status, create an action, publish a clinical review or message the patient automatically
- OpenAI credentials remain server-side only
- provider requests use `store: false`
- existing request-scoped consent/RLS must still be enforced before authorized health context can be used

AI activation requires a separate validation gate and is not required for the first human-led Concierge pilot.

## 15. Security / privacy negative tests

Must fail:
- patient reading another patient's request
- patient reading staff-only case notes
- non-staff opening professional queue data
- Nurse B reading Patient A's assigned case/context
- Doctor B reading Patient A's assigned medical review
- nurse reading a patient with no assignment/eligible unassigned case
- doctor reading a non-escalated case not assigned to them
- nurse arbitrarily assigning a different physician
- doctor changing nursing assignment
- coordinator clinical context access after patient revocation
- patient editing clinical review directly
- nurse publishing patient-visible final clinical review
- request-context RPC returning an unlinked exam
- patient self-enrolling into a team-started clinical program
- creation of proactive alert after consent revocation
- professional rewriting original patient-authored request text/context
- nurse assigning a different nurse through a direct database call
- doctor assigning a different doctor through a direct database call
- patient using reply routing to change a non-waiting request to another operational status
- patient reply RPC after Concierge consent revocation

## 16. Regression checks

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

## 17. Definition of validation success

The MVP is ready for a controlled human-led pilot only when:

- latest branch CI is green
- all 15 migrations apply cleanly in validation
- `SQL_CONCIERGE_VALIDATION_PRECHECK_V1.sql` returns PASS
- synthetic persona seed returns PASS
- all role-access negative tests pass
- patient consent/revocation works end-to-end
- new request routes to the reference nurse when one exists
- medical escalation routes to the reference physician when one exists
- patient → nurse → physician → patient second-analysis flow passes
- patient reply returns a waiting case to the correct professional lane
- action-plan recurrence passes
- operational alert acknowledge/resolve lifecycle passes
- operational patient workspace stays non-clinical by default
- patient access audit is visible and accurate
- unified agenda renders canonical data without duplication
- longitudinal My Health renders with and without device data without diagnostic claims
- family coordination reuses existing HealthWallet family records without duplication
- first-response SLA instrumentation is verified
- workload metrics are recorded
- plan-vs-no-plan segmentation and data-quality coverage render correctly
- `SQL_CONCIERGE_VALIDATION_POSTCHECK_V1.sql` returns PASS after the canonical E2E
- HealthWallet existing features regress cleanly

Only after this gate do we decide when/how to publish the site/app experience.
