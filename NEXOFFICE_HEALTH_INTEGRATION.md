# HealthWallet / MyDataMed → NexOffice Integration

Status: **controlled-validation only**. This branch is not authorized for production deployment.

## Purpose

This integration connects MyDataMed professional operations to NexOffice without changing the HealthWallet product architecture, HealthWallet Connect, Android Health Connect permissions, or the Google Play release strategy.

HealthWallet remains the canonical patient/clinical data layer. MyDataMed remains the professional operations layer. NexOffice receives only the minimum professional/workspace identity needed for federated access plus aggregate operational signals accepted by the NexOffice Health firewall.

## Trust boundary

The browser never receives `NEXOFFICE_INTERNAL_KEY` and never calls the NexOffice API directly. It calls the same-origin `/api/nexoffice` route. A Netlify Function validates the current Supabase user, requires an active `concierge_staff` professional record, derives the NexOffice workspace on the server, applies the Health privacy boundary, and only then calls NexOffice.

The NexOffice API base URL is configuration, not domain logic. `NEXOFFICE_API_BASE_URL` is required by the server-side adapter. Normal configuration points to `https://api.nexoffices.com.br`; controlled staging may point to `https://nexoffice-staging-api.onrender.com`.

## Data allowed to cross the boundary

### Workspace / tenant provisioning

- `sourceProduct = mydatamed` (forced by adapter)
- `vertical = health` (forced by adapter)
- server-derived `externalWorkspaceRef`
- workspace/business display name
- NexOffice member role
- empty entitlement extension list unless explicitly changed later under a reviewed contract

### Minimum professional federated identity

- authenticated professional email
- professional display name
- namespaced external subject: `mydatamed:user:<auth-user-id>`
- mapped NexOffice member role

The adapter intentionally does not send professional registration numbers or specialty.

### Aggregate operational signals

Only these NexOffice Health firewall contracts are accepted:

- `appointments.summary`: scheduled, completed, cancelled, noShow, pending
- `requests.summary`: open, overdue, escalated, resolved
- `sla.summary`: total, withinSla, breached, avgFirstResponseMinutes, complianceRatio
- `workload.summary`: activeCases, waitingReview, waitingPatientReply, dueToday
- `programs.summary`: enrolled, active, completed, paused

Additional allowed metadata is limited to:

- aggregate period start/end
- aggregate window: hour/day/week/month
- scope: workspace/team only
- optional idempotency/correlation ID

Privacy returned by NexOffice for Health signals is expected to be `aggregate_only`.

## Data explicitly forbidden from crossing

The adapter has no contract for, and privacy tests reject, patient-level or raw clinical payloads. In particular, do **not** send:

- patient name, email, phone, CPF, identifiers or patient UUIDs
- `profiles` or other patient personal profile fields
- family members or family clinical data
- health-plan cards or beneficiary data
- `medical_records`, exams, files, laboratory data, OCR or extracted exam contents
- medications, prescriptions, dosage, adherence or medication notes
- clinical chart / prontuário
- Medical Passport
- MedScore / `health_scores` values or factors
- Health Connect data
- `health_daily_summaries`
- wearable/device readings, heart rate, HRV, SpO2, blood pressure, weight, calories, steps or sleep data
- symptoms, patient request descriptions or clinical context snapshots
- Concierge case messages, professional notes, review text or attachments
- diagnosis, clinical inference, treatment recommendation or raw clinical alert content

The privacy validator is strict: unknown top-level signal fields and unknown metric fields are rejected before any request is sent to NexOffice. Health scope `member` is rejected.

## Tenant isolation

The browser cannot select `externalWorkspaceRef`.

The server derives the workspace from, in order:

1. `concierge_staff.metadata.nexoffice_workspace_ref` and `nexoffice_workspace_name`; or
2. server environment `NEXOFFICE_MYDATAMED_WORKSPACE_REF` and `NEXOFFICE_MYDATAMED_WORKSPACE_NAME`.

This preserves a path to per-organization tenancy without allowing a browser caller to cross tenant boundaries by submitting another workspace identifier.

NexOffice provisioning itself is idempotent on the canonical `(sourceProduct, externalWorkspaceRef)` origin contract.

## Federated flows

### Provision

Browser → `/api/nexoffice` action `provision` → server-authenticated professional → NexOffice `POST /v1/platform/provision`.

The adapter forces the MyDataMed/Health source and vertical. Invite tokens returned by NexOffice are not exposed by the HealthWallet bridge response.

### Browser handoff

Browser → `/api/nexoffice` action `handoff` → NexOffice `POST /v1/platform/handoff`.

The returned handoff code is short-lived and one-time according to the NexOffice platform contract. The browser receives only the handoff result needed to navigate to NexOffice.

### Federated session exchange

Browser → `/api/nexoffice` action `session_exchange` → NexOffice `POST /v1/platform/session-exchange`.

The same server-derived workspace and namespaced professional external subject are used for tenant isolation.

### Health operational signal

Browser/internal caller → `/api/nexoffice` action `health_signal` → strict local aggregate-only validation → NexOffice `POST /v1/platform/health-signals`.

Only active MyDataMed `admin` or `care_coordinator` roles can submit aggregate Health signals through this bridge. The NexOffice Health firewall applies a second independent validation layer.

## Environment variables

Server-side only unless otherwise noted:

- `NEXOFFICE_API_BASE_URL` — required. Normal configuration: canonical NexOffice API. Controlled staging: staging API.
- `NEXOFFICE_INTERNAL_KEY` — required secret. Never use a `VITE_` prefix and never expose it in browser code.
- `NEXOFFICE_MYDATAMED_WORKSPACE_REF` — trusted fallback workspace origin reference.
- `NEXOFFICE_MYDATAMED_WORKSPACE_NAME` — trusted fallback workspace display name.
- `NEXOFFICE_ENFORCE_EXTERNAL_EFFECTS_OFF` — set `true` in controlled staging.
- `NEXOFFICE_TIMEOUT_MS` — optional request timeout, default 10000 ms.
- existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are used by the server function to validate the caller with their own Supabase JWT; no Supabase service-role key is introduced by this adapter.

## Controlled validation

Automated branch CI must pass before any staging integration test:

1. privacy-boundary unit tests;
2. no hardcoded absolute NexOffice URL in adapter logic;
3. explicit proof that Android, `healthwallet-connect/`, and Google Play strategy files are untouched;
4. production frontend build;
5. optional live NexOffice staging health probe when staging credentials are configured.

The live probe only calls `GET /v1/platform/health` and requires `externalEffects=false`. It does not provision a workspace, create a handoff, exchange a session, or send operational data.

For the GitHub Actions live staging probe configure:

- repository variable `NEXOFFICE_STAGING_API_BASE_URL=https://nexoffice-staging-api.onrender.com`
- repository secret `NEXOFFICE_STAGING_INTERNAL_KEY` matching the NexOffice staging API

Do not paste the internal key into issues, commits, logs or chat.

## Production gate

This integration must remain on its feature branch / draft PR until the controlled staging probe and an agreed end-to-end test account/workspace have been validated. No Netlify production deployment, no `main` merge, and no Health Connect/Google Play change is part of this implementation step.
