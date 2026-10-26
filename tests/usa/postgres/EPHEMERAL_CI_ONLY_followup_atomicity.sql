-- Alternative Ventures USA / MyDataMed - disposable PostgreSQL 17 tests.
-- NOT a production migration, PHI database, HIPAA certification or EHR.
-- Never use against the existing Brazilian Supabase/clinical databases.
DO $guard$
BEGIN
 IF current_database() <> 'usa_health_contract_ci'
    OR current_setting('app.usa_ephemeral_contract_ci', true) IS DISTINCT FROM 'SYNTHETIC_ONLY' THEN
   RAISE EXCEPTION 'REFUSING NON-EPHEMERAL USA HEALTH TEST';
 END IF;
END
$guard$;

BEGIN;
CREATE ROLE usa_health_anon_ci NOLOGIN;
CREATE ROLE usa_health_authenticated_ci NOLOGIN;
CREATE SCHEMA usa_health_ci;
REVOKE ALL ON SCHEMA usa_health_ci FROM PUBLIC;

CREATE TABLE usa_health_ci.consents (
 tenant_id uuid NOT NULL,
 patient_id uuid NOT NULL,
 clinician_id uuid NOT NULL,
 scope text NOT NULL CHECK (scope = 'clinical_tasks'),
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 PRIMARY KEY (tenant_id, patient_id, clinician_id, scope),
 CHECK (expires_at > issued_at)
);
CREATE TABLE usa_health_ci.tasks (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 patient_id uuid NOT NULL,
 clinician_id uuid NOT NULL,
 kind text NOT NULL DEFAULT 'lab_review',
 status text NOT NULL CHECK (status IN ('open','in_progress','completed','cancelled')),
 revision integer NOT NULL CHECK (revision >= 0),
 updated_at timestamptz NOT NULL
);
CREATE TABLE usa_health_ci.task_audit (
 event_id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 task_id uuid NOT NULL,
 clinician_id uuid NOT NULL,
 old_status text NOT NULL,
 new_status text NOT NULL,
 resulting_revision integer NOT NULL,
 occurred_at timestamptz NOT NULL
);
ALTER TABLE usa_health_ci.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE usa_health_ci.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE usa_health_ci.task_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA usa_health_ci
 FROM PUBLIC, usa_health_anon_ci, usa_health_authenticated_ci;

CREATE FUNCTION usa_health_ci.transition_with_audit(
 p_tenant uuid, p_patient uuid, p_clinician uuid, p_task uuid,
 p_expected_revision integer, p_to text, p_event uuid, p_now timestamptz
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_revision integer; v_before text;
BEGIN
 IF p_tenant IS NULL OR p_patient IS NULL OR p_clinician IS NULL OR
    p_task IS NULL OR p_event IS NULL OR p_expected_revision IS NULL OR
    p_to NOT IN ('in_progress','completed','cancelled') OR p_now IS NULL THEN
   RAISE EXCEPTION 'invalid clinical task command';
 END IF;

 -- Shared lock on the exact consent row: a concurrent revoke update cannot
 -- commit between authorization and the subsequent task+audit write.
 -- Caller must be an independently authenticated trusted US backend role.
 PERFORM 1 FROM usa_health_ci.consents c
 WHERE c.tenant_id=p_tenant AND c.patient_id=p_patient
   AND c.clinician_id=p_clinician AND c.scope='clinical_tasks'
   AND c.issued_at <= p_now AND c.expires_at > p_now
   AND (c.revoked_at IS NULL OR c.revoked_at > p_now)
 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'clinical consent not current'; END IF;

 SELECT status INTO v_before FROM usa_health_ci.tasks
 WHERE id=p_task AND tenant_id=p_tenant AND patient_id=p_patient
   AND clinician_id=p_clinician AND revision=p_expected_revision
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'stale or foreign task'; END IF;

 IF NOT ((v_before='open' AND p_to IN ('in_progress','completed','cancelled'))
     OR (v_before='in_progress' AND p_to IN ('completed','cancelled'))) THEN
   RAISE EXCEPTION 'invalid task state transition';
 END IF;

 UPDATE usa_health_ci.tasks
 SET status=p_to, revision=revision+1, updated_at=p_now
 WHERE id=p_task AND tenant_id=p_tenant AND patient_id=p_patient
   AND clinician_id=p_clinician AND revision=p_expected_revision
 RETURNING revision INTO v_revision;
 IF NOT FOUND OR v_revision <> p_expected_revision + 1 THEN
   RAISE EXCEPTION 'concurrent task revision conflict';
 END IF;

 -- A duplicate audit event aborts the UPDATE above, preventing partial
 -- writes. No ON CONFLICT DO NOTHING allowed for this ledger.
 INSERT INTO usa_health_ci.task_audit(
  event_id,tenant_id,task_id,clinician_id,old_status,new_status,resulting_revision,occurred_at
 ) VALUES (p_event,p_tenant,p_task,p_clinician,v_before,p_to,v_revision,p_now);

 RETURN v_revision;
END
$$;
REVOKE ALL ON FUNCTION usa_health_ci.transition_with_audit(
 uuid,uuid,uuid,uuid,integer,text,uuid,timestamptz)
 FROM PUBLIC, usa_health_anon_ci, usa_health_authenticated_ci;

DO $test$
DECLARE
 t uuid := '11111111-1111-4111-8111-111111111111';
 p uuid := '22222222-2222-4222-8222-222222222222';
 c uuid := '33333333-3333-4333-8333-333333333333';
 a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 out_scope uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 event1 uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 event2 uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 now_at timestamptz := '2026-10-26T15:00:00Z';
 next_revision integer; denied boolean; status_actual text; revision_actual integer;
BEGIN
 IF pg_catalog.has_table_privilege('usa_health_anon_ci','usa_health_ci.tasks','SELECT')
    OR pg_catalog.has_table_privilege('usa_health_authenticated_ci','usa_health_ci.tasks','UPDATE')
    OR pg_catalog.has_function_privilege(
      'usa_health_authenticated_ci',
      'usa_health_ci.transition_with_audit(uuid,uuid,uuid,uuid,integer,text,uuid,timestamptz)',
      'EXECUTE') THEN
   RAISE EXCEPTION 'client role improperly granted clinical access';
 END IF;

 INSERT INTO usa_health_ci.consents VALUES (
   t,p,c,'clinical_tasks','2026-10-01T00:00:00Z','2026-11-30T00:00:00Z',NULL
 );
 INSERT INTO usa_health_ci.tasks(id,tenant_id,patient_id,clinician_id,status,revision,updated_at)
 VALUES
 (a,t,p,c,'open',2,'2026-10-20T00:00:00Z'),
 (b,t,p,c,'open',4,'2026-10-20T00:00:00Z'),
 (out_scope,'99999999-9999-4999-8999-999999999999',p,c,'open',1,'2026-10-20T00:00:00Z');

 SELECT usa_health_ci.transition_with_audit(t,p,c,a,2,'in_progress',event1,now_at)
 INTO next_revision;
 IF next_revision <> 3 THEN RAISE EXCEPTION 'revision was not atomically advanced'; END IF;

 denied := false;
 BEGIN
   PERFORM usa_health_ci.transition_with_audit(t,p,c,a,2,'completed',event2,now_at);
 EXCEPTION WHEN OTHERS THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'stale revision was accepted'; END IF;

 denied := false;
 BEGIN
   PERFORM usa_health_ci.transition_with_audit(t,p,c,out_scope,1,'in_progress',event2,now_at);
 EXCEPTION WHEN OTHERS THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'cross-tenant task mutation accepted'; END IF;

 -- Valid revision, but duplicate audit UUID: UPDATE must roll back.
 denied := false;
 BEGIN
   PERFORM usa_health_ci.transition_with_audit(t,p,c,b,4,'in_progress',event1,now_at);
 EXCEPTION WHEN unique_violation THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'duplicate clinical audit event accepted'; END IF;
 SELECT status,revision INTO status_actual,revision_actual
   FROM usa_health_ci.tasks WHERE id=b;
 IF status_actual <> 'open' OR revision_actual <> 4 THEN
   RAISE EXCEPTION 'clinical task modified despite failed audit insert';
 END IF;

 -- Consent revoked: even an otherwise valid command cannot update.
 UPDATE usa_health_ci.consents SET revoked_at='2026-10-25T00:00:00Z'
  WHERE tenant_id=t AND patient_id=p AND clinician_id=c;
 denied := false;
 BEGIN
   PERFORM usa_health_ci.transition_with_audit(t,p,c,b,4,'completed',event2,now_at);
 EXCEPTION WHEN OTHERS THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'revoked clinical grant allowed task write'; END IF;
 IF (SELECT count(*) FROM usa_health_ci.task_audit) <> 1 THEN
   RAISE EXCEPTION 'unexpected partial or duplicated clinical audit';
 END IF;
 RAISE NOTICE 'PASS: atomic CAS update, consent lock, RLS client deny, replay and rollback';
END
$test$;

ROLLBACK;
-- Entire CI-only schema and roles are rolled back; no patient data.
