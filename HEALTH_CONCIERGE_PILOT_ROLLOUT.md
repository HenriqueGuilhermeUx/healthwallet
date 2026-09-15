# HealthWallet / MyDataMed — Health Concierge Pilot Rollout

## Status

The Concierge MVP is validated in an ephemeral Supabase environment through real Auth, PostgREST and RLS using the canonical migration chain. The production HealthWallet database remains untouched by Concierge migrations and currently has no `concierge_%` tables or routines.

The pre-Concierge security stack is also runtime-validated:

- the current production schema passed the read-only V1, V2 and V3 preflights;
- the exact **V1 → V2 → V3** migration order passed in an ephemeral Supabase stack;
- the final read-only V3 postcheck passed after that exact sequence;
- the runtime schema contract passed;
- the three-persona patient / Professional A / Professional B Auth + PostgREST + RLS E2E passed;
- the transition-safe frontend passes TypeScript/Vite build and the secure-sharing source contract;
- no production DDL/DML or production deployment was executed by these validations.

Passing isolated validation is necessary, but it is not permission to publish or migrate production automatically.

## Release principle

The rollout is split into four gates:

1. **Data-free staging schema** — prove the real cloud database path without patient data.
2. **Controlled human smoke test** — verify the application against staging with non-sensitive test accounts only.
3. **Production security hardening** — publish the fail-closed sharing frontend first, then apply and verify the validated HealthWallet security stack.
4. **Explicit production pilot approval** — only then migrate Concierge production schema and enroll the limited real pilot cohort.

Any failed gate is **NO-GO** for the next gate.

---

## Gate A — Data-free Supabase staging

### Preconditions

Use a disposable Supabase development/staging branch or project distinct from HealthWallet production.

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

- `HEALTHWALLET_PRODUCTION_PROJECT_REF` — deny-list guard only;
- `CONCIERGE_PILOT_DB_URL` — disposable staging database URL.

Required workflow inputs:

- `target_project_ref` — staging/pilot Supabase ref;
- `confirmation` — exactly `BOOTSTRAP PILOT ONLY`.

The workflow refuses to continue if the target matches production, the URL does not correspond to the requested staging ref, patient/auth data already exists, or Concierge tables already exist.

### Atomic Concierge schema application

The bootstrap applies in one database transaction:

1. `SQL_CONCIERGE_PILOT_COMPAT_V1.sql`
2. the canonical 15 Concierge migrations, in documented order;
3. `SQL_CONCIERGE_VALIDATION_PRECHECK_V1.sql`.

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
- program catalog and operational rules exist;
- there are zero Concierge staff, memberships, assignments, requests, events, actions, enrollments, alerts, work logs, consent events, reviews and context access logs;
- `anon` has no direct Concierge table privileges;
- `authenticated` has only the operation-specific Data API privileges required by RLS;
- production remains unchanged.

---

## Gate B — Controlled human smoke test

Gate B uses staging only and non-sensitive test identities. Do not copy production users or health data.

Minimum smoke path:

1. create non-sensitive Auth accounts specifically for staging;
2. register one nurse, one physician and one coordinator explicitly in `concierge_staff`;
3. create one test membership and deterministic reference care team;
4. accept consent through the patient UI;
5. create a routine request;
6. verify routing to the reference nurse;
7. verify a non-assigned nurse cannot read the case;
8. verify patient reply returns the case to the nurse lane;
9. escalate to medical review and verify routing to the reference physician;
10. verify a nurse cannot arbitrarily assign another physician;
11. verify a physician cannot change nursing ownership;
12. publish a structured physician review and verify patient visibility;
13. verify context access is request-scoped and audited;
14. revoke consent and verify the access kill switch;
15. verify patient agenda/family surfaces against canonical HealthWallet contracts;
16. generate a new V2 health-share token from the patient UI;
17. verify an anonymous browser cannot read health data from the token/link;
18. sign in as the test professional and redeem the token;
19. verify only explicitly shared categories become visible;
20. verify a second professional cannot reuse the bound token;
21. revoke the token as the patient and verify professional access disappears immediately.

Do not enable autonomous AI actions. AI assist remains dormant unless the explicit AI consent scope and release gate are separately approved.

Gate B passes only when browser/app behavior matches the authorization already proven by the canonical Concierge and Secure Health Sharing E2Es.

---

## Gate C — Production database security hardening

The current production HealthWallet project has pre-existing security findings that must be fixed before a real Concierge pilot. Read-only audit confirmed that legacy `SECURITY DEFINER` views can expose clinical rows to `anon`; this is a release blocker, not a cosmetic advisory.

### Production sequencing — mandatory

The production transition must use this exact high-level sequence:

1. **Publish the transition-safe sharing frontend first.**
   - `ShareQRCode.tsx` lists/revokes legacy codes using only pre-V2-compatible columns.
   - it never falls back to browser-generated or six-digit codes;
   - if `create_health_access_code` is not yet available, new sharing is temporarily disabled with a fail-closed message;
   - `AccessCode.tsx` rejects any token that is not the V2 `HW-[0-9A-F]{36}` format **before professional login or clinical queries**;
   - legacy bearer links therefore stop opening clinical data before the database hardening begins.
2. Run all three read-only production preflights and require PASS.
3. Apply **V1 → V2 → V3** in the exact validated order.
4. Run `SQL_PRE_CONCIERGE_SECURITY_POSTCHECK_V3.sql` immediately.
5. Rerun Supabase security/performance advisors and targeted anonymous-access probes.
6. Smoke-test secure sharing with approved non-sensitive accounts.
7. Only after Gate C is PASS may production Concierge schema be considered under Gate D.

This order avoids both incompatible windows:

- applying V2 while an old frontend still tries direct `access_codes` INSERTs;
- publishing a frontend that depends on V2-only schema while V2 is not installed.

During the short frontend-first maintenance window, **new sharing fails closed rather than falling back to the insecure legacy model**.

### Mandatory preflight sequence

Before any production security DDL, run and require **PASS**:

1. `SQL_PRE_CONCIERGE_SECURITY_PREFLIGHT_V1.sql`
2. `SQL_PRE_CONCIERGE_SECURE_SHARING_PREFLIGHT_V2.sql`
3. `SQL_PRE_CONCIERGE_VIEW_HARDENING_PREFLIGHT_V3.sql`

If the live schema has drifted from any preflight assumption, stop and re-review the migration. Do not force stale DDL through production.

### Mandatory migration order

Apply exactly:

1. `SQL_PRE_CONCIERGE_SECURITY_HARDENING_V1.sql`
   - fixes mutable function `search_path` findings;
   - narrows privileged `SECURITY DEFINER` RPC execution;
   - hardens identity checks in access-code, trial and device-summary RPCs;
   - keeps internal billing/usage mutation helpers service-role only.
2. `SQL_PRE_CONCIERGE_SECURE_SHARING_V2.sql`
   - retires new creation/redemption of weak anonymous six-digit bearer codes;
   - moves token generation server-side using `pgcrypto` entropy;
   - requires an authenticated professional profile to redeem;
   - binds first redemption to one professional;
   - scopes RLS to the exact patient and explicitly authorized categories;
   - records patient-visible redemption audit;
   - revocation immediately removes professional access;
   - preserves legacy code rows only for patient history/revocation, not V2 redemption.
3. `SQL_PRE_CONCIERGE_VIEW_HARDENING_V3.sql`
   - converts the five advised views to `security_invoker`;
   - removes anonymous access to clinical/professional views;
   - preserves authenticated exam/medication autocomplete behavior;
   - replaces legacy professional policies that ignored expiry/revocation/category semantics.

Do not reorder these files: V3 depends on the authorization helper introduced by V2.

### Runtime evidence required by source control

The branch must remain green on:

- `.github/workflows/pre-concierge-security-contract.yml`;
- `.github/workflows/secure-health-sharing-contract.yml`;
- `.github/workflows/secure-health-sharing-local-e2e.yml`;
- `.github/workflows/health-concierge-validation-contract.yml`.

The full local security E2E must execute:

1. synthetic legacy validation schema;
2. `SQL_SECURE_HEALTH_SHARING_VALIDATION_V1_DEPS.sql`;
3. V1;
4. V2;
5. V3;
6. `SQL_PRE_CONCIERGE_SECURITY_POSTCHECK_V3.sql`;
7. runtime schema contract;
8. three-persona Auth/PostgREST/RLS E2E.

It must prove:

- anonymous creation/redemption is denied;
- patient cannot directly insert a legacy bearer code;
- V2 token is cryptographically generated server-side;
- Professional A has no clinical access before redemption;
- Professional A receives only categories selected by the patient after redemption;
- Professional B remains isolated and cannot reuse Professional A's token;
- patient sees redemption audit;
- patient revocation immediately removes Professional A access;
- anonymous callers cannot read device-score or clinical-context views;
- patient security-invoker views still work under owner RLS;
- authenticated autocomplete views still work after `security_invoker` conversion;
- authorized professional document-delivery view access still works;
- privileged V1 internal RPCs are no longer callable by ordinary authenticated users.

### Post-migration verification

Immediately after V1/V2/V3 and before any Concierge production schema:

1. run `SQL_PRE_CONCIERGE_SECURITY_POSTCHECK_V3.sql` and require PASS;
2. rerun Supabase security advisors;
3. rerun Supabase performance advisors;
4. verify the five `SECURITY DEFINER` view errors are gone;
5. verify `anon` cannot SELECT `patient_device_score_latest` or `vw_patient_clinical_context`;
6. verify `anon` cannot execute secure sharing RPCs;
7. verify authenticated self-service flows still work;
8. verify HealthWallet Connect continues using its authenticated direct-table/RLS synchronization path;
9. verify no Android/Health Connect permission architecture changed;
10. review leaked-password protection configuration separately from database DDL.

Gate C is **PASS** only after live production post-migration evidence is captured. Source-level and ephemeral green tests alone do not mark production hardening complete.

---

## Gate D — Explicit production pilot approval

Only after Gates A, B and C pass should production Concierge migration be considered.

Production release must be a separate explicit operation and must not be triggered by a normal branch push or merge.

Before migration, capture:

- exact Git commit SHA being released;
- canonical migration order;
- database backup/PITR readiness;
- production preflight/post-hardening evidence;
- Supabase security advisor output;
- intended initial staff roster;
- intended limited pilot cohort;
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

Discard the disposable staging branch/project if bootstrap or smoke testing exposes a schema/runtime problem. Production is unaffected.

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
- Pre-Concierge V1 production-schema preflight: **PASS, read-only**.
- Secure Health Sharing V2 production-schema preflight: **PASS, read-only**.
- View Hardening V3 production-schema preflight: **PASS, read-only**.
- Exact V1 → V2 → V3 + final postcheck runtime validation: **PASS in ephemeral Supabase**.
- Three-persona secure-sharing Auth/PostgREST/RLS E2E: **PASS**.
- Transition-safe sharing frontend TypeScript/Vite + security contract: **PASS**.
- Production security migrations V1/V2/V3: **not applied**.
- Production Concierge schema: **not installed**.
- Separate hosted Supabase staging branch/project: **not available under the current Free-plan quota**.
- Production frontend publication of the secure transition UI: **not performed**.

Therefore the current state is:

**GO for continued isolated/staging preparation. NO-GO for production publication, production database migration or real-patient rollout until explicitly authorized and Gate C is executed/revalidated in production.**
