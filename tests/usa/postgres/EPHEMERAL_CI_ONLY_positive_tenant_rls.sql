-- MyDataMed USA: POSITIVE/NEGATIVE tenant-scoped RLS in disposable PG17.
-- CI fixture ONLY; mapping below is an illustrative fixed SQL role mapping,
-- NOT a production identity provider, JWT/GUC authorization, or PHI schema.
DO $guard$
BEGIN
  IF current_database() <> 'usa_health_contract_ci' OR
     current_setting('app.usa_ephemeral_contract_ci', true) IS DISTINCT FROM 'SYNTHETIC_ONLY'
  THEN RAISE EXCEPTION 'REFUSING NON-EPHEMERAL USA TENANT RLS TEST';
  END IF;
END $guard$;

BEGIN;
CREATE ROLE usa_clinician_alpha_ci NOLOGIN;
CREATE ROLE usa_clinician_beta_ci NOLOGIN;
CREATE SCHEMA usa_tenant_rls_ci;
REVOKE ALL ON SCHEMA usa_tenant_rls_ci FROM PUBLIC;
GRANT USAGE ON SCHEMA usa_tenant_rls_ci TO usa_clinician_alpha_ci, usa_clinician_beta_ci;

CREATE TABLE usa_tenant_rls_ci.task (
 task_id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 clinician_id uuid NOT NULL,
 synthetic_kind text NOT NULL,
 CHECK (length(synthetic_kind) BETWEEN 1 AND 40)
);
ALTER TABLE usa_tenant_rls_ci.task ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON usa_tenant_rls_ci.task TO usa_clinician_alpha_ci, usa_clinician_beta_ci;
-- Actual RLS evaluates the PostgreSQL role, NOT a client-controlled GUC.
-- Production identity -> role mapping must be independently implemented.
CREATE POLICY alpha_select ON usa_tenant_rls_ci.task
 FOR SELECT TO usa_clinician_alpha_ci
 USING (tenant_id = '11111111-1111-4111-8111-111111111111'::uuid
    AND clinician_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
CREATE POLICY beta_select ON usa_tenant_rls_ci.task
 FOR SELECT TO usa_clinician_beta_ci
 USING (tenant_id = '22222222-2222-4222-8222-222222222222'::uuid
    AND clinician_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
CREATE POLICY alpha_insert ON usa_tenant_rls_ci.task
 FOR INSERT TO usa_clinician_alpha_ci
 WITH CHECK (tenant_id = '11111111-1111-4111-8111-111111111111'::uuid
    AND clinician_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
CREATE POLICY beta_insert ON usa_tenant_rls_ci.task
 FOR INSERT TO usa_clinician_beta_ci
 WITH CHECK (tenant_id = '22222222-2222-4222-8222-222222222222'::uuid
    AND clinician_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);

INSERT INTO usa_tenant_rls_ci.task VALUES
 ('10101010-1010-4010-8010-101010101010',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','synthetic_alpha'),
 ('20202020-2020-4020-8020-202020202020',
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','synthetic_beta');

SET LOCAL ROLE usa_clinician_alpha_ci;
DO $alpha$
DECLARE n integer; denied boolean := false;
BEGIN
 SELECT count(*) INTO n FROM usa_tenant_rls_ci.task;
 IF n <> 1 THEN RAISE EXCEPTION 'alpha read leaked or lost rows: %', n; END IF;
 INSERT INTO usa_tenant_rls_ci.task VALUES (
   '30303030-3030-4030-8030-303030303030',
   '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','synthetic_allowed');
 BEGIN
   INSERT INTO usa_tenant_rls_ci.task VALUES (
    '40404040-4040-4040-8040-404040404040',
    '22222222-2222-4222-8222-222222222222',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','synthetic_foreign');
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'alpha inserted beta tenant task'; END IF;
 SELECT count(*) INTO n FROM usa_tenant_rls_ci.task;
 IF n <> 2 THEN RAISE EXCEPTION 'alpha read was not tenant-confined'; END IF;
END $alpha$;
RESET ROLE;

SET LOCAL ROLE usa_clinician_beta_ci;
DO $beta$
DECLARE n integer; denied boolean := false;
BEGIN
 SELECT count(*) INTO n FROM usa_tenant_rls_ci.task;
 IF n <> 1 THEN RAISE EXCEPTION 'beta read leaked or lost rows: %', n; END IF;
 BEGIN
  INSERT INTO usa_tenant_rls_ci.task VALUES (
   '50505050-5050-4050-8050-505050505050',
   '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','synthetic_cross_tenant');
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'beta inserted alpha tenant task'; END IF;
END $beta$;
RESET ROLE;
DO $verify$
DECLARE total integer;
BEGIN
 SELECT count(*) INTO total FROM usa_tenant_rls_ci.task;
 IF total <> 3 THEN RAISE EXCEPTION 'wrong number of synthetic rows: %', total; END IF;
 RAISE NOTICE 'PASS: separate database roles, tenant-scoped positive SELECT/INSERT, cross-tenant denied';
END $verify$;
ROLLBACK;
-- Every role, policy, grant and row disappears after execution.
