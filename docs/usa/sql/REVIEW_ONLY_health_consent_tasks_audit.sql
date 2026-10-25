-- ALTERNATIVE VENTURES USA / HEALTH WALLET + MYDATAMED
-- REVIEW ONLY — OUTSIDE supabase/migrations — NEVER AUTO-EXECUTE
--
-- Target: brand new US-only Supabase/Postgres database, not Health Wallet BR.
-- Explicitly DISARMED by default; even an authorized session does not prove
-- this design satisfies HIPAA, FTC, state privacy rules, or BAA requirements.
-- Only a reviewed server backend with a dedicated DB role may access tables.
-- No browser/anon/authenticated privileges, keys, tokens, or real PHI here.
--
-- The operator must first verify the target project/region and transaction
-- set LOCAL app.alternative_ventures_usa = 'ISOLATED_US_APPROVED';
-- in the SAME transaction. No migration runner references this file.

begin;
do $guard$
begin
  if current_setting('app.alternative_ventures_usa', true) is distinct from 'ISOLATED_US_APPROVED' then
    raise exception 'HEALTH USA DDL DISARMED: never apply to Brazil or shared infrastructure';
  end if;
end
$guard$;

create schema if not exists usa_health_private;
revoke all on schema usa_health_private from public, anon, authenticated;

-- One canonical current grant per patient/clinic/practitioner/purpose.
-- Rotations/history and revocation events MUST be written to a separate
-- append-only ledger by the audited US server; no grant snapshots from client.
create table if not exists usa_health_private.clinical_consents (
  patient_id uuid not null,
  tenant_id uuid not null,
  practitioner_id uuid not null,
  purpose text not null check (purpose in ('treatment','care_coordination')),
  scopes text[] not null check (array_length(scopes, 1) between 1 and 7),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  version text not null,
  updated_at timestamptz not null default now(),
  primary key (patient_id, tenant_id, practitioner_id, purpose),
  check (expires_at > issued_at),
  check (revoked_at is null or revoked_at >= issued_at),
  check (scopes <@ array['summary','exams','medications','timeline','documents','device_data','clinical_tasks']::text[])
);
create index if not exists usa_health_consents_tenant_clinician_idx
  on usa_health_private.clinical_consents(tenant_id, practitioner_id);

-- Clinical follow-up tasks are not diagnoses, and deadlines are not triage.
create table if not exists usa_health_private.followup_tasks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  tenant_id uuid not null,
  clinician_id uuid not null,
  kind text not null check (kind in ('lab_review','routine_followup','medication_reconciliation','document_review')),
  status text not null check (status in ('open','in_progress','completed','cancelled')),
  created_at timestamptz not null default now(),
  due_at timestamptz not null,
  updated_at timestamptz not null default now(),
  check (due_at >= created_at)
);
create index if not exists usa_health_followups_owner_idx
  on usa_health_private.followup_tasks(tenant_id, clinician_id, patient_id, status);

-- No patient names, encounter notes, test values, tokens, or raw IDs.
-- Pseudonyms remain sensitive and require US data protection, retention
-- limits and restricted operational access, even after HMAC.
create table if not exists usa_health_private.clinical_access_audit (
  event_id uuid primary key,
  occurred_at timestamptz not null,
  principal_pseudonym text not null check (principal_pseudonym ~ '^[a-f0-9]{64}$'),
  patient_pseudonym text not null check (patient_pseudonym ~ '^[a-f0-9]{64}$'),
  tenant_pseudonym text not null check (tenant_pseudonym ~ '^[a-f0-9]{64}$'),
  actor_role text not null check (actor_role in ('patient','clinician','care_coordinator')),
  purpose text not null check (purpose in ('treatment','care_coordination')),
  scope text not null check (scope in ('summary','exams','medications','timeline','documents','device_data','clinical_tasks')),
  decision text not null check (decision in ('allow','deny')),
  reason text not null,
  recorded_at timestamptz not null default now()
);
create index if not exists usa_health_audit_recorded_at_idx
  on usa_health_private.clinical_access_audit(recorded_at);

-- Explicit grants matter in addition to RLS. No client can read/write ANY
-- private clinical table; retention and privileged insert/write RPC design
-- require separate approval. This proposal grants no server writer privileges.
alter table usa_health_private.clinical_consents enable row level security;
alter table usa_health_private.followup_tasks enable row level security;
alter table usa_health_private.clinical_access_audit enable row level security;
revoke all on all tables in schema usa_health_private from public, anon, authenticated;

commit;

-- MANDATORY external release gates:
-- 1. Verify new US-only project ref/region, exposed schemas and DB owner.
-- 2. Build/approve US authorization service and least-privilege DB writer.
-- 3. Run database RLS negative tests: anonymous, other patient/tenant, revoked,
--    expired grants, clinician role changes, insert/update/delete attempts.
-- 4. Append-only audit enforcement, HMAC secret rotation/retention and backups.
-- 5. EHR sandbox, FHIR-US Core profile negotiation, BAA/privacy assessments.
-- NOTHING above has been executed in this delivery.
