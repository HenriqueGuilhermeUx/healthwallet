# HealthWallet Concierge — Canonical E2E Validation Runbook

This runbook is the deterministic human-led validation sequence for the Concierge MVP.

**Never run it against production data or the public HealthWallet database.**

The purpose is to prove the complete operating loop:

```text
Patient -> HealthWallet Concierge -> reference nurse -> reference physician -> patient
                     |                      |
                     +-> action plan -------+
                     +-> audit trail
                     +-> workload / SLA metrics
```

The first controlled pilot is not approved until this sequence passes together with `HEALTH_CONCIERGE_VALIDATION.md`.

---

## 0. Hard release boundaries

Before starting:

- use `feature/health-concierge-mvp`
- use a non-production Supabase project/environment
- use synthetic users only
- do not merge the branch to production
- do not publish the Concierge routes to the public HealthWallet app/site
- do not broaden the main HealthWallet Android Health Connect permission set
- do not activate the dormant AI assist

The test is human-led. AI is not required for this E2E.

---

## 1. Create synthetic Auth users

Create these nine users in the validation Supabase Auth environment:

| Persona | E-mail | Purpose |
| --- | --- | --- |
| Patient A | `concierge.patient.a@healthwallet.test` | enrolled, with health plan |
| Patient B | `concierge.patient.b@healthwallet.test` | enrolled, without health plan |
| Patient C | `concierge.patient.c@healthwallet.test` | not enrolled negative-control patient |
| Nurse A | `concierge.nurse.a@healthwallet.test` | Patient A reference nurse |
| Nurse B | `concierge.nurse.b@healthwallet.test` | Patient B reference nurse / unauthorized control for A |
| Doctor A | `concierge.doctor.a@healthwallet.test` | Patient A reference physician |
| Doctor B | `concierge.doctor.b@healthwallet.test` | Patient B reference physician / unauthorized control for A |
| Coordinator | `concierge.coord@healthwallet.test` | roster and portfolio coordination |
| Admin | `concierge.admin@healthwallet.test` | administrative validation role |

Use test passwords controlled only by the validation team. Do not commit passwords to GitHub.

---

## 2. Apply migrations in the canonical order

Run manually in the validation database, in this exact order:

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

Then run:

16. `SQL_CONCIERGE_VALIDATION_PRECHECK_V1.sql`

Expected final row:

```text
validation_precheck = PASS
```

Do not continue if the precheck raises any exception.

---

## 3. Seed deterministic personas

Run:

`SQL_CONCIERGE_VALIDATION_SEED_V1.sql`

Expected:

- Patient A = `pilot`, `has_health_plan = true`, consent pending
- Patient B = `pilot`, `has_health_plan = false`, consent pending
- Patient C = no Concierge membership
- Patient A primary team = Nurse A + Doctor A
- Patient B primary team = Nurse B + Doctor B
- all staff identities are active
- final seed result = `PASS`

The seed intentionally refuses to run after the synthetic patients already have requests/consent events. This protects the validation audit trail.

---

## 4. Prepare canonical HealthWallet data for Patient A

Using the normal HealthWallet UI and synthetic content only, create enough canonical data to exercise context without creating duplicate Concierge records:

- one family member
- one active medication
- one health reminder
- one synthetic exam/document in the normal HealthWallet exam flow
- a MedScore record if the validation environment supports it
- optional Health Connect/device summary data if available

Do not create a second exam, medication, wearable or family table for Concierge.

Expected:

- data remains in the normal HealthWallet domain
- Concierge references it instead of copying it

---

## 5. Negative enrollment control — Patient C

Sign in as Patient C and open `/concierge`.

Expected:

- controlled-pilot/not-enrolled state
- cannot create a Concierge case
- no professional receives access to Patient C context

**PASS evidence:** screenshot or validation note with timestamp.

---

## 6. Consent — Patient A

Sign in as Patient A.

Expected before consent:

- Concierge redirects to `/concierge/consent`
- no request-scoped professional context is available

Accept the Concierge consent using the patient UI.

Expected after consent:

- membership `consent_status = accepted`
- `consented_at` and version populated
- immutable `concierge_consent_events` entry created
- patient can open Concierge Home

Do not enable `ai_assist` scope in this MVP validation.

---

## 7. Reference-team routing — Patient A -> Nurse A

As Patient A, create a **Second analysis** request and select the synthetic exam.

Expected immediately after creation:

- request status = `new`
- request has `assigned_nurse_id = Nurse A`
- request does not route to Nurse B
- linked exam is a reference in `context_snapshot`, not a duplicated file
- request automation event contains IDs/category/urgency, not the raw health narrative

Validation query example:

```sql
SELECT
  r.id,
  r.status,
  nurse.email AS assigned_nurse,
  doctor.email AS assigned_doctor
FROM public.concierge_requests r
LEFT JOIN auth.users nurse ON nurse.id = r.assigned_nurse_id
LEFT JOIN auth.users doctor ON doctor.id = r.assigned_doctor_id
WHERE r.patient_id = (
  SELECT id FROM auth.users WHERE email = 'concierge.patient.a@healthwallet.test'
)
ORDER BY r.created_at DESC
LIMIT 1;
```

Expected assigned nurse:

`concierge.nurse.a@healthwallet.test`

---

## 8. Nurse workflow — first response, context and action

Sign in as Nurse A and open MyDataMed Concierge Ops.

Expected:

- Patient A case appears in Nurse A queue
- Nurse B does not receive direct request access to the assigned case
- professional layout is MyDataMed/operations layout, not the patient HealthWallet layout

Open the case.

### 8.1 Authorized context

Click **Carregar contexto autorizado**.

Expected:

- context loads only because Patient A has active consent and Nurse A is authorized
- only request-scoped/authorized sections are returned
- linked exam is available only if exam scope is allowed
- raw storage URL is not returned
- `concierge_context_access_logs` records the access

### 8.2 First professional response

Add a patient-visible update and record realistic synthetic work minutes.

Expected:

- `first_response_at` is populated once
- later interactions do not overwrite it
- work log records Nurse A minutes
- patient timeline contains the visible update

### 8.3 Create next step

Create one action with a due date.

Expected:

- action appears in the patient's Concierge plan
- canonical request/case remains linked
- patient cannot rewrite operational fields of the action

---

## 9. Waiting-patient reply loop

As Nurse A, move the case to **Aguardar paciente** with a question.

As Patient A, open the case and reply.

Expected:

- reply is written through `concierge_patient_reply()`
- case automatically returns from `waiting_patient` to `waiting_nurse`
- Nurse A remains the routed owner
- raw reply text is not copied into `automation_events`
- patient cannot use the reply path to rewrite another request field

---

## 10. Medical escalation — Nurse A -> Doctor A

As Nurse A, escalate the case to medical review.

Expected immediately:

- status = `escalated_medical`
- `assigned_doctor_id = Doctor A`
- Doctor B does not become owner
- Nurse A cannot arbitrarily assign Doctor B through a direct client update

Validation query:

```sql
SELECT
  r.status,
  doctor.email AS assigned_doctor
FROM public.concierge_requests r
LEFT JOIN auth.users doctor ON doctor.id = r.assigned_doctor_id
WHERE r.patient_id = (
  SELECT id FROM auth.users WHERE email = 'concierge.patient.a@healthwallet.test'
)
ORDER BY r.created_at DESC
LIMIT 1;
```

Expected doctor:

`concierge.doctor.a@healthwallet.test`

---

## 11. Physician workflow — structured review

Sign in as Doctor A.

Expected:

- case appears in physician queue
- unrelated operational alerts do not flood the physician queue
- Doctor B cannot open the assigned Patient A case

Open the case and complete the structured clinical review.

Expected:

- nurse may prepare/draft, but only authorized physician can publish final patient-visible review
- completed review is linked to the request
- patient-visible completion event is created
- clinical review wording does not present AI/wearable signals as diagnosis

Record physician work minutes.

---

## 12. Return to patient — complete care loop

Sign in as Patient A.

Expected:

- case timeline shows professional updates in order
- final physician review is visible when marked patient-visible
- action plan contains the next step
- Home prioritizes anything requiring patient action
- `Minha Saúde` reuses canonical HealthWallet data
- `Minha Família` reuses canonical family records
- `Minha Equipe` shows Nurse A + Doctor A

At this point the primary E2E loop has passed:

```text
Patient A -> Nurse A -> Doctor A -> Patient A
```

---

## 13. Alert lifecycle

Create or make one synthetic action overdue, then run the validation alert refresh mechanism (`concierge_refresh_time_alerts()`) if needed.

Expected in operations:

- alert appears as a workflow signal, not a diagnosis
- Nurse A/coordinator can open the related operational patient workspace
- alert can be acknowledged
- alert can be resolved/dismissed according to the UI flow
- resolved alert no longer remains in the open queue

The operational patient workspace may show:

- consent state
- care-team assignment
- active cases
- actions
- operational alerts

It must **not** become a blanket view of exams, medications, MedScore, device summaries or the full clinical timeline. Those remain request-scoped inside an authorized case.

---

## 14. Consent revocation kill switch

As Patient A, open Concierge consent controls and revoke access.

Expected immediately:

- `consent_status = revoked`
- membership pauses
- revocation audit event is created
- new request-context loads fail
- `concierge_can_access_patient()` becomes false for ordinary care-team access
- open proactive Concierge alerts for Patient A are dismissed
- patient cannot send a new Concierge reply while consent is inactive

Previously created patient-owned HealthWallet data remains the patient's data; revoking Concierge does not delete their HealthWallet history.

---

## 15. Segment B — patient without health plan

Sign in as Patient B and accept consent.

Create at least one routine guidance request and perform one Nurse B interaction.

Expected:

- Patient B routes to Nurse B
- Patient B remains `has_health_plan = false`
- workload/engagement instrumentation records this segment separately

This is required so the pilot analytics dashboard has at least one synthetic observation in both plan segments.

---

## 16. Role / privacy negative controls

The following must fail:

- Patient B reading Patient A request
- Patient A reading staff-only note
- Patient C creating a Concierge request without membership/consent
- Nurse B opening Patient A's assigned case/context
- Doctor B opening Patient A's assigned medical review
- Nurse A arbitrarily assigning Doctor B
- Doctor A changing Patient A nursing assignment
- patient altering request title/description/context after creation
- nurse publishing final patient-visible clinical review
- professional loading Patient A context after consent revocation
- request-context RPC returning an exam not linked to the request
- patient self-enrolling into a team-started clinical program
- new proactive alert surviving insertion after consent revocation

Any unexpected success is a release blocker.

---

## 17. Pilot analytics verification

After the flows above, open `/concierge/ops/pilot` as Coordinator/Admin.

Expected instrumentation:

- active pilot lives
- requests per patient
- engaged patient rate
- repeat-use rate when applicable
- human minutes per patient
- nurse/coordinator minutes
- physician minutes
- escalation rate
- first-response metrics
- resolution metrics
- workload coverage
- `with plan` vs `without plan` segmentation

Do not infer pricing from this synthetic run. The purpose is to verify instrumentation, not unit economics conclusions.

---

## 18. Existing HealthWallet regression pass

Before approving the branch for a controlled pilot, re-test:

- login and base consent
- Dashboard
- Exams/upload
- Medications
- Family
- MedScore
- Telemedicine
- Care Links
- Device Data
- HealthWallet Connect return bridge

Critical Android rule remains unchanged:

**Concierge development must not broaden the main HealthWallet Health Connect permission strategy.**

---

## 19. Evidence package

For one canonical validation run, preserve:

- branch head SHA
- CI run IDs and conclusions
- precheck PASS timestamp
- seed PASS output
- synthetic request ID used for E2E
- timestamps for first response and physician escalation
- screenshots/notes for patient, nurse and physician stages
- consent access-audit evidence
- workload/SLA metric evidence
- negative-test results
- final regression checklist

Never put real health data or test passwords into this evidence package.

---

## 20. Final go/no-go rule

**GO for controlled human-led pilot** only when all are true:

- branch CI is green
- 15 migrations apply cleanly
- validation precheck = PASS
- synthetic seed = PASS
- Patient C negative enrollment control passes
- Patient A consent flow passes
- new request routes to Nurse A automatically
- medical escalation routes to Doctor A automatically
- patient reply routing passes
- request-scoped context + patient-visible access audit pass
- nurse/physician authorization boundaries pass
- action plan and alert lifecycle pass
- consent revocation kill switch passes
- Patient B plan-segmentation path passes
- analytics instrumentation renders
- existing HealthWallet regression passes

Any failed item is **NO-GO** until corrected and revalidated.
