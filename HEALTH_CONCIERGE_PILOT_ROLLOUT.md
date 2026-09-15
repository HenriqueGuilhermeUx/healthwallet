# HealthWallet / MyDataMed — Health Concierge Pilot Rollout

## Status

The Concierge MVP is validated in an ephemeral Supabase environment through real Auth, PostgREST and RLS using the canonical migration chain. The production HealthWallet database remains untouched by Concierge migrations and currently has no `concierge_%` tables or routines.

This document defines the path from validation-only to a controlled release. Passing local validation is necessary, but it is not permission to publish or migrate production automatically.

## Release principle

The rollout is deliberately split into four gates:

1. **Data-free staging schema** — prove the real cloud database path without patient data.
2. **Controlled human smoke test** — verify the application against staging with non-sensitive test accounts only.
3. **Production security hardening** — resolve or explicitly disposition current database security advisories before introducing the clinical coordination module to real users.
4. **Explicit production pilot approval** — only then migrate production and enroll the limited real pilot cohort.

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

### Atomic schema application

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
15. verify patient agenda/family surfaces against the canonical HealthWallet contracts.

Do not enable autonomous AI actions. AI assist remains dormant unless the explicit AI consent scope and release gate are separately approved.

Gate B passes only when the browser/app behavior matches the database authorization already proven by the canonical E2E.

---

## Gate C — Production database security hardening

The current production HealthWallet project already has security advisories that predate Concierge. Concierge did not create them, but a clinical coordination module should not be layered onto unresolved high-severity database findings without review.

Before production rollout:

- remediate or explicitly disposition every **ERROR** advisory from the Supabase database linter;
- review `SECURITY DEFINER` views and convert them to the intended `security_invoker`/RLS model where appropriate;
- review privileged functions callable by `anon` or `authenticated` and reduce EXECUTE grants to the minimum required roles;
- set immutable/safe `search_path` on privileged functions where missing;
- review leaked-password protection configuration;
- rerun Supabase security and performance advisors after any DDL/security change;
- preserve existing Health Connect permission and compliance architecture.

This hardening is a separate change set from Concierge migrations so that pre-existing risks and new module risks remain auditable independently.

---

## Gate D — Explicit production pilot approval

Only after Gates A, B and C pass should production migration be considered.

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

After production migration and before enrolling real users:

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

- Canonical isolated E2E: **PASS**.
- Auth/PostgREST/RLS role isolation: **PASS**.
- Reference Nurse → Doctor routing guards: **PASS**.
- Explicit Data API privilege matrix: **PASS in isolated validation**.
- Canonical family reminder compatibility: implemented in branch.
- Production Concierge schema: **not installed**.
- Separate Supabase staging branch: **not yet created**.
- Production security hardening: **pending**.
- Production application/site publication: **not performed**.

Therefore the current state is:

**GO to prepare/create a data-free staging environment. NO-GO for production migration or real-patient rollout yet.**
