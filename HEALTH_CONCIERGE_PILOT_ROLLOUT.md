# HealthWallet / MyDataMed — Health Concierge Pilot Rollout

## Status

The Concierge MVP is validated in an ephemeral Supabase environment through real Auth, PostgREST and RLS using the canonical migration chain. The production HealthWallet database remains untouched by Concierge migrations and currently has no `concierge_%` tables or routines.

The pre-Concierge security work has also progressed beyond static review:

- the current production schema passed the read-only function/security preflight;
- Secure Health Sharing V2 passed its read-only production-schema preflight;
- View Hardening V3 passed its read-only production-schema preflight;
- V2 + V3 passed a separate ephemeral runtime E2E using real Supabase Auth, PostgREST and RLS with one synthetic patient and two synthetic professionals;
- no production DDL/DML was executed by those validations.

This document defines the path from validation-only to a controlled release. Passing local validation is necessary, but it is not permission to publish or migrate production automatically.

## Release principle

The rollout is deliberately split into four gates:

1. **Data-free staging schema** — prove the real cloud database path without patient data.
2. **Controlled human smoke test** — verify the application against staging with non-sensitive test accounts only.
3. **Production security hardening** — apply and verify the validated HealthWallet security stack before introducing the clinical coordination module to real users.
4. **Explicit production pilot approval** — only then migrate Concierge production schema and enroll the limited real pilot cohort.

Any failed gate is **NO-GO** for the next gate.

---

## Gate A — Data-free Supabase staging

### Preconditions

Use a disposable Supabase development/staging branch or project that is distinct from the HealthWallet production project.

The target must:

- have the canonical HealthWallet schema;
- contain zero Auth users and zero patient/health rows;
- contain no existing `concierge_%` tables;
- not be the production project ref;
- not contain copied production data.

Do not put real patient data, medical records, credentials or production secrets into this gate.

### Bootstrap workflow

Run `.github/workflows/health-concierge-pilot-bootstrap.yml` manually from `feature/health-concierge-mvp`.

Required repository secrets:

- `HEALTHWALLET_PRODUCTION_PROJECT_REF` — used only as a deny-list guard;
- `CONCIERGE_PILOT_DB_URL` — database URL for the disposable staging target.

Required workflow inputs:

- `target_project_ref` — the staging/pilot Supabase ref;
- `confirmation` — exactly `BOOTSTRAP PILOT ONLY`.

The workflow refuses to continue if the target matches production, the URL does not correspond to the requested staging ref, patient/auth data already exists, or Concierge tables already exist.

### Atomic Concierge schema application

The bootstrap applies, in one database transaction:

1. `SQL_CONCIERGE_PILOT_COMPAT_V1.sql`
2. the canonical 15 Concierge migrations, in documented order;
3. `SQL_CONCIERGE_VALIDATION_PRECHECK_V1.sql` as a read-only release contract.

If any migration or precheck assertion fails, the transaction rolls back.

The remote bootstrap must never execute:

- `SQL_CONCIERGE_VALIDATION_BASE_V1.sql`;
- `SQL_CONCIERGE_VALIDATION_SEED_V1.sql`;
- `SQL_CONCIERGE_VALIDATION_SESSION_DIAGNOSTICS_V1.sql`;
- synthetic `@healthwallet.test` persona creation;
- `supabase link`, `supabase db push` or `--linked` operations.

### Expected result

After Gate A:

- Concierge schema exists in staging;
- the program catalog and operational rules exist;
- there are zero Concierge staff, memberships, assignments, requests, events, actions, enrollments, alerts, work logs, consent events, reviews and context access logs;
- `anon` has no direct Concierge table privileges;
- `authenticated` has only the operation-specific Data API privileges required by the RLS contract;
- production remains unchanged.

---

## Gate B — Controlled human smoke test

Gate B uses staging only and non-sensitive test identities. Do not copy production users or health data.

Minimum smoke path:

1. create a small set of non-sensitive Auth accounts specifically for staging;
2. register one nurse, one physician and one coordinator explicitly in `concierge_staff`;
3. create one test membership and a deterministic reference care team;
4. accept consent through the patient UI;
5. create a routine request;
6. verify routing to the reference nurse;
7. verify a non-assigned nurse cannot read the case;
8. verify patient reply returns the case to the nurse lane;
9. escalate to medical review and verify routing to the reference physician;
10. verify a nurse cannot arbitrarily assign a different physician;
11. verify a physician cannot change nursing ownership;
12. publish a structured physician review and verify patient visibility;
13. verify context access is request-scoped and audited;
14. revoke consent and verify the access kill switch;
15. verify patient agenda/family surfaces against the canonical HealthWallet contracts;
16. generate a new V2 health-share token from the patient UI;
17. verify an anonymous browser cannot read health data from the token/link;
18. sign in as the test professional and redeem the token;
19. verify only explicitly shared categories become visible;
20. verify a second professional cannot reuse the bound token;
21. revoke the token as the patient and verify professional access disappears immediately.

Do not enable autonomous AI actions. AI assist remains dormant unless the explicit AI consent scope and release gate are separately approved.

Gate B passes only when the browser/app behavior matches the database authorization already proven by the canonical Concierge and Secure Health Sharing E2Es.

---

## Gate C — Production database security hardening

The current production HealthWallet project has pre-existing security findings that must be fixed before a real Concierge pilot. Concierge did not create these findings, but the read-only audit confirmed that some legacy `SECURITY DEFINER` views can currently expose clinical rows to `anon`; this is therefore a release blocker, not a cosmetic advisory.

### Mandatory preflight sequence

Before any production security DDL, run the read-only files against the current production schema and require **PASS**:

1. `SQL_PRE_CONCIERGE_SECURITY_PREFLIGHT_V1.sql`
2. `SQL_PRE_CONCIERGE_SECURE_SHARING_PREFLIGHT_V2.sql`
3. `SQL_PRE_CONCIERGE_VIEW_HARDENING_PREFLIGHT_V3.sql`

If the live schema has drifted from any preflight assumption, stop and re-review the migration. Do not force stale DDL through production.

### Mandatory migration order

The security stack must be applied in this order:

1. `SQL_PRE_CONCIERGE_SECURITY_HARDENING_V1.sql`
   - fixes mutable function `search_path` findings;
   - narrows privileged `SECURITY DEFINER` RPC execution;
   - hardens identity checks in access-code, trial and device-summary RPCs;
   - keeps internal billing/usage mutation helpers service-role only.
2. `SQL_PRE_CONCIERGE_SECURE_SHARING_V2.sql`
   - retires new creation/redemption of weak anonymous six-digit bearer codes;
   - moves new token generation server-side using `pgcrypto` entropy;
   - requires an authenticated professional profile to redeem;
   - binds the first redemption to one professional;
   - scopes RLS to the exact patient and explicitly authorized categories;
   - records patient-visible redemption audit;
   - revocation immediately removes professional access;
   - preserves legacy code rows only for patient history/revocation, not V2 redemption.
3. `SQL_PRE_CONCIERGE_VIEW_HARDENING_V3.sql`
   - converts the five advised views to `security_invoker`;
   - removes anonymous access to clinical/professional views;
   - preserves authenticated exam/medication autocomplete behavior;
   - replaces legacy professional policies that ignored expiry/revocation/category semantics.

Do not reorder these files: V3 intentionally depends on the authorization helper introduced by V2.

### Runtime evidence already required by source control

Before production application, the branch must remain green on:

- `.github/workflows/pre-concierge-security-contract.yml`;
- `.github/workflows/secure-health-sharing-contract.yml`;
- `.github/workflows/secure-health-sharing-local-e2e.yml`.

The local Secure Health Sharing E2E must continue to prove through real Auth/PostgREST/RLS that:

- anonymous creation/redemption is denied;
- the patient cannot directly insert a legacy bearer code;
- a V2 token is cryptographically generated server-side;
- Professional A has no clinical access before redemption;
- Professional A receives only the categories selected by the patient after redemption;
- Professional B remains isolated and cannot reuse Professional A's token;
- the patient sees the redemption audit;
- patient revocation immediately removes Professional A's access;
- anonymous callers cannot read the device-score or clinical-context views;
- the patient's own security-invoker views still work under owner RLS;
- authenticated autocomplete views still work after `security_invoker` conversion;
- authorized professional document-delivery view access still works.

### Post-migration verification

Immediately after the three security migrations and before any Concierge production schema is installed:

- rerun all three read-only preflights in their post-migration/review form as applicable;
- rerun Supabase security advisors;
- rerun Supabase performance advisors;
- verify the five `SECURITY DEFINER` view errors are gone;
- verify `anon` cannot SELECT `patient_device_score_latest` or `vw_patient_clinical_context`;
- verify `anon` cannot execute secure sharing RPCs;
- verify authenticated self-service flows still work;
- verify HealthWallet Connect continues using its existing authenticated direct-table/RLS synchronization path;
- verify no Android/Health Connect permission architecture changed;
- review leaked-password protection configuration separately from database DDL.

Gate C is **PASS** only after the live production advisor/runtime evidence is captured after migration. Source-level and ephemeral green tests alone do not mark production hardening complete.

---

## Gate D — Explicit production pilot approval

Only after Gates A, B and C pass should production Concierge migration be considered.

Production release must be a separate, explicit operation. It must not be triggered by a normal branch push or merge.

Before migration, capture:

- the exact Git commit SHA being released;
- the canonical migration order;
- database backup/PITR readiness;
- the production preflight output;
- Supabase security advisor output;
- the intended initial staff roster;
- the intended limited pilot cohort;
- rollback/disable procedure;
- patient consent copy/version;
- human operational escalation contacts.

After production Concierge migration and before enrolling real users:

- run the read-only Concierge precheck;
- confirm explicit Data API grants and RLS;
- verify zero unexpected Concierge operational rows;
- enroll staff manually and minimally;
- enroll only the approved limited pilot cohort;
- monitor workload, response SLA, escalation rate, consent revocations and access audit events.

---

## Automation posture

`automation_events` is not required for the initial human-led pilot. Core Concierge care flows must continue to work when automation infrastructure is absent.

When automation is introduced later:

- queue only sanitized event metadata;
- never place raw health narrative in automation payloads;
- fetch sensitive context only by authorized request ID;
- keep n8n/worker credentials server-side;
- do not allow automation to publish clinical conclusions autonomously.

---

## Rollback posture

### Staging

Discard the disposable staging branch/project if the bootstrap or smoke test exposes a schema/runtime problem. Production is unaffected.

### Production security hardening

If a security migration breaks a required authenticated workflow, stop before installing Concierge. Restore the reviewed previous function/policy/view definition or use the database recovery plan appropriate to the migration. Do not weaken RLS or re-enable anonymous clinical access as a quick workaround.

### Production pilot

The first operational rollback is **disablement**, not destructive data removal:

- stop new Concierge enrollment;
- pause memberships if necessary;
- remove patient navigation entry/feature exposure through the release layer;
- preserve consent, access and clinical audit history;
- avoid dropping tables as an emergency response unless a separately reviewed data-retention plan explicitly requires it.

Clinical/audit history must not be silently destroyed by rollback.

---

## Current release state

- Canonical Concierge isolated E2E: **PASS**.
- Concierge Auth/PostgREST/RLS role isolation: **PASS**.
- Reference Nurse → Doctor routing guards: **PASS**.
- Explicit Concierge Data API privilege matrix: **PASS in isolated validation**.
- Canonical family reminder compatibility: **implemented in branch**.
- Pre-Concierge function-security production preflight: **PASS, read-only**.
- Secure Health Sharing V2 production-schema preflight: **PASS, read-only**.
- View Hardening V3 production-schema preflight: **PASS, read-only**.
- Secure Health Sharing V2 + View Hardening V3 ephemeral Auth/PostgREST/RLS E2E: **PASS**.
- Production security migrations V1/V2/V3: **not applied**.
- Production Concierge schema: **not installed**.
- Separate hosted Supabase staging branch/project: **not available yet under the current Free-plan quota**.
- Production application/site publication: **not performed**.

Therefore the current state is:

**GO for continued isolated/staging preparation. NO-GO for production migration, production publication or real-patient rollout until Gate C is explicitly applied and revalidated in production.**
