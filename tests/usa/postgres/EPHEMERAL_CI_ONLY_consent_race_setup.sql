-- EPHEMERAL CI ONLY: Postgres 17 two-session consent-revocation race.
-- NEVER migrate or execute in any real patient database.
DO $guard$
BEGIN
 IF current_database() <> 'usa_health_contract_ci'
    OR current_setting('app.usa_ephemeral_contract_ci', true) IS DISTINCT FROM 'SYNTHETIC_ONLY' THEN
    RAISE EXCEPTION 'REFUSING NON-EPHEMERAL USA HEALTH RACE SETUP';
 END IF;
END $guard$;
BEGIN;
CREATE SCHEMA usa_health_race_ci;
REVOKE ALL ON SCHEMA usa_health_race_ci FROM PUBLIC;
CREATE TABLE usa_health_race_ci.consent (
 tenant_id uuid NOT NULL, patient_id uuid NOT NULL, clinician_id uuid NOT NULL,
 issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 PRIMARY KEY(tenant_id,patient_id,clinician_id)
);
CREATE TABLE usa_health_race_ci.task (
 task_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, patient_id uuid NOT NULL,
 clinician_id uuid NOT NULL, status text NOT NULL, revision integer NOT NULL
);
CREATE TABLE usa_health_race_ci.audit (
 event_id uuid PRIMARY KEY, task_id uuid NOT NULL, revision integer NOT NULL
);
ALTER TABLE usa_health_race_ci.consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE usa_health_race_ci.task ENABLE ROW LEVEL SECURITY;
ALTER TABLE usa_health_race_ci.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA usa_health_race_ci FROM PUBLIC;
CREATE FUNCTION usa_health_race_ci.transition(
 p_tenant uuid, p_patient uuid, p_clinician uuid, p_task uuid, p_revision int,
 p_event uuid, p_time timestamptz
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE new_revision integer;
BEGIN
 -- The lock is held until the caller's transaction COMMIT, not released
 -- when this function returns. An UPDATE that revokes consent must wait.
 PERFORM 1 FROM usa_health_race_ci.consent
 WHERE tenant_id=p_tenant AND patient_id=p_patient AND clinician_id=p_clinician
   AND issued_at <= p_time AND expires_at > p_time
   AND (revoked_at IS NULL OR revoked_at > p_time)
 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'clinical grant revoked or absent'; END IF;

 UPDATE usa_health_race_ci.task SET status='in_progress', revision=revision+1
 WHERE task_id=p_task AND tenant_id=p_tenant AND patient_id=p_patient
   AND clinician_id=p_clinician AND revision=p_revision AND status='open'
 RETURNING revision INTO new_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'task version or authorization mismatch'; END IF;
 INSERT INTO usa_health_race_ci.audit(event_id,task_id,revision)
 VALUES(p_event,p_task,new_revision);
 RETURN new_revision;
END
$$;

INSERT INTO usa_health_race_ci.consent VALUES
 ('11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '2026-10-01T00:00:00Z','2026-11-30T00:00:00Z',NULL);
INSERT INTO usa_health_race_ci.task VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333','open',2);
COMMIT;
