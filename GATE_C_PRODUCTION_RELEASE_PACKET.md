# HealthWallet — Gate C Production Release Packet

Generated: 2026-09-15 (America/Sao_Paulo)

## Purpose

This packet records the exact production state and the remaining controlled steps for Gate C. It does not authorize Concierge production rollout and does not contain credentials.

## Production targets

- Supabase project: `HealthWallet`
- Supabase project ref: `qcxdvygbinqkxuahlrrn`
- Netlify site: `healthwallet1`
- Netlify site id: `6385fa98-ad7a-4fd2-8cfa-5d903f437502`
- Netlify production URL: `https://healthwallet1.netlify.app`

## Frontend release state

The transition-safe secure-sharing code has been isolated and promoted to `main` without merging the Concierge feature set.

The production deploy currently remains on the older Netlify build:

- current Netlify deploy id: `6aa875395149240008f352b2`
- current deployed commit: `5dfe408e56579bd5ac6903682807121cd758018e`
- current deploy state: `ready`
- current deployed title: `feat: show and persist clinician wearable summary`

The repository `main` contains the transition-safe sharing frontend and the hardened production deploy workflow. The deploy workflow with the dedicated trigger path was finalized at commit:

- `06c918ba3e6247db2bb7e8851c2d96d16e23756f`

The workflow has two deliberate invocation paths:

1. manual `workflow_dispatch` with exact confirmation `DEPLOY GATE C FRONTEND`; or
2. a push that changes only the dedicated file `.github/gate-c-netlify-deploy-trigger.txt`.

The dedicated trigger file is currently **DISARMED**. For a push-triggered production deploy, its first line must be exactly:

`DEPLOY GATE C FRONTEND`

and it must contain a non-empty `request_id=...` line. Normal application-code pushes do not match the deploy workflow path filter and therefore cannot publish this Gate C release.

The workflow performs:

1. checkout of the exact `main` commit;
2. dedicated-trigger authorization when invoked by push;
3. Node 22 + Corepack setup;
4. `pnpm install --no-frozen-lockfile`;
5. source assertions proving the fail-closed secure-sharing frontend is present;
6. TypeScript/Vite production build;
7. Netlify credential guard;
8. production deploy to the existing HealthWallet Netlify site;
9. HTTP reachability check against the resulting deploy URL.

No Netlify access token is stored in source control. The workflow expects a GitHub Actions secret named `NETLIFY_AUTH_TOKEN` (legacy supported secret aliases are accepted, but `NETLIFY_AUTH_TOKEN` is canonical).

## Frontend build evidence

GitHub Actions run `35037488040` proved before the credential gate that:

- dependency installation succeeded with the same no-frozen-lockfile mode configured in Netlify;
- transition-safe source assertions succeeded;
- TypeScript/Vite production build succeeded;
- 1,582 modules transformed;
- deploy did not execute because no supported Netlify GitHub secret existed.

This failure occurred before Netlify publication and did not mutate the database.

## Production read-only preflight evidence

All three live production preflights were rerun on 2026-09-15 immediately before this packet was created. All were read-only and returned PASS:

1. V1 preflight — PASS at `2026-09-15 23:50:12.583942+00`
2. V2 preflight — PASS at `2026-09-15 23:50:24.848672+00`
3. V3 preflight — PASS at `2026-09-15 23:50:36.479619+00`

There was no production schema drift relative to the validated V1/V2/V3 assumptions.

## Live security baseline before Gate C DDL

Targeted privilege probe confirms the legacy state is still present before hardening:

- `anon` can SELECT `patient_device_score_latest`: true
- `anon` can SELECT `vw_patient_clinical_context`: true
- `anon` can SELECT `access_codes`: true
- `anon` can SELECT `shared_access`: true
- `anon` can EXECUTE legacy `create_access_code(uuid,jsonb,integer)`: true
- secure V2 create RPC exists before V2: false
- secure V2 redeem RPC exists before V2: false

Security advisor baseline immediately before Gate C DDL includes:

- 5 `security_definer_view` ERROR findings;
- 22 mutable function `search_path` WARN findings;
- 9 anonymous-executable `SECURITY DEFINER` function WARN findings;
- 9 authenticated-executable `SECURITY DEFINER` function WARN findings;
- leaked-password protection disabled advisory;
- additional existing RLS/extension advisories outside the narrow Gate C migration scope.

Performance advisor baseline was also captured. Performance cleanup is intentionally separate from the security migration unless required for correctness.

## Mandatory production sequence after Netlify credential exists

Do not reorder these steps.

### 1. Publish transition-safe frontend

Preferred automated handoff after `NETLIFY_AUTH_TOKEN` exists:

- update `.github/gate-c-netlify-deploy-trigger.txt` on `main` so line 1 is `DEPLOY GATE C FRONTEND`;
- set a unique non-empty `request_id=...` line;
- push only that dedicated trigger-file change.

The same deployment may alternatively be started manually from `.github/workflows/gate-c-netlify-deploy.yml` with:

`confirmation = DEPLOY GATE C FRONTEND`

Require:

- workflow success;
- Netlify deploy state `ready`;
- current production deploy commit equals or contains the transition-safe `main` state;
- production URL responds successfully.

If this fails, STOP. Do not apply database DDL.

### 2. Rerun production preflights

Run and require PASS again immediately before DDL:

1. `SQL_PRE_CONCIERGE_SECURITY_PREFLIGHT_V1.sql`
2. `SQL_PRE_CONCIERGE_SECURE_SHARING_PREFLIGHT_V2.sql`
3. `SQL_PRE_CONCIERGE_VIEW_HARDENING_PREFLIGHT_V3.sql`

Any drift is STOP/REVIEW.

### 3. Apply Gate C migrations

Apply exactly:

1. `SQL_PRE_CONCIERGE_SECURITY_HARDENING_V1.sql`
2. `SQL_PRE_CONCIERGE_SECURE_SHARING_V2.sql`
3. `SQL_PRE_CONCIERGE_VIEW_HARDENING_V3.sql`

Use migration-aware DDL execution. Do not use synthetic validation schema or seed files against production.

### 4. Immediate postcheck

Run:

- `SQL_PRE_CONCIERGE_SECURITY_POSTCHECK_V3.sql`

Require PASS before proceeding.

### 5. Live post-hardening probes

Require all of the following:

- `anon` cannot SELECT `patient_device_score_latest`;
- `anon` cannot SELECT `vw_patient_clinical_context`;
- `anon` cannot SELECT `access_codes`;
- `anon` cannot SELECT `shared_access`;
- legacy weak-code creation is not executable by `anon` or ordinary authenticated users;
- secure sharing RPCs exist with intended execution scope;
- the five views are `security_invoker`;
- authenticated patient ownership paths still function;
- HealthWallet Connect authenticated direct-table/RLS sync path remains unchanged.

### 6. Rerun Supabase advisors

Rerun security and performance advisors and compare against the baseline above.

The five security-definer view ERROR findings must be gone. Gate C-specific function execution/search-path findings must reflect the hardened contract.

### 7. Controlled non-sensitive smoke

Use approved non-sensitive accounts only:

- patient creates a V2 share token;
- anonymous browser cannot obtain clinical data;
- Professional A authenticates and redeems;
- only selected categories become visible;
- Professional B cannot reuse the token;
- patient sees redemption audit;
- patient revokes;
- Professional A loses access immediately.

## Stop conditions

STOP before the next mutation if any of the following occurs:

- frontend production deploy not confirmed `ready`;
- production preflight fails;
- migration error or unexpected schema drift;
- postcheck fails;
- anonymous clinical exposure remains;
- patient self-service regression appears;
- HealthWallet Connect direct-table/RLS sync regresses.

Do not install production Concierge schema while any Gate C stop condition exists.

## Current decision

As of this packet:

- transition-safe frontend code: READY in repository `main`;
- transition-safe frontend build: PASS;
- dedicated production deploy trigger: READY and DISARMED;
- transition-safe frontend production publication: BLOCKED only by missing Netlify GitHub secret;
- production V1/V2/V3 preflights: PASS read-only;
- production V1/V2/V3 DDL: NOT APPLIED;
- production Concierge schema: NOT INSTALLED;
- HealthWallet Connect strategy: UNCHANGED;
- Android Health Connect permission strategy: UNCHANGED.
