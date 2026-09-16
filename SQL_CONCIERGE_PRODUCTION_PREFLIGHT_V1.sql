-- =====================================================
-- HEALTHWALLET / MYDATAMED - CONCIERGE PRODUCTION PREFLIGHT V1
-- READ ONLY. RUN BEFORE ANY GATE D CONCIERGE DDL.
-- =====================================================

DO $$
DECLARE
  failures TEXT[] := ARRAY[]::TEXT[];
  concierge_objects INTEGER;
BEGIN
  SELECT count(*) INTO concierge_objects
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r','p','v','m','S')
    AND c.relname LIKE 'concierge_%';

  IF concierge_objects <> 0 THEN
    failures := array_append(failures, 'existing-concierge-objects:' || concierge_objects);
  END IF;

  IF to_regprocedure('public.create_health_access_code(jsonb,integer)') IS NULL THEN
    failures := array_append(failures, 'gate-c:create-health-access-code-missing');
  END IF;

  IF to_regprocedure('public.redeem_health_access_code(text)') IS NULL THEN
    failures := array_append(failures, 'gate-c:redeem-health-access-code-missing');
  END IF;

  IF to_regprocedure('private.has_health_share_access(uuid,text[])') IS NULL THEN
    failures := array_append(failures, 'gate-c:share-helper-missing');
  END IF;

  IF has_table_privilege('anon', 'public.access_codes', 'SELECT') THEN
    failures := array_append(failures, 'gate-c:anon-access-codes-select');
  END IF;

  IF has_table_privilege('anon', 'public.shared_access', 'SELECT') THEN
    failures := array_append(failures, 'gate-c:anon-shared-access-select');
  END IF;

  IF has_table_privilege('anon', 'public.vw_patient_clinical_context', 'SELECT') THEN
    failures := array_append(failures, 'gate-c:anon-clinical-context-view-select');
  END IF;

  IF has_table_privilege('anon', 'public.patient_device_score_latest', 'SELECT') THEN
    failures := array_append(failures, 'gate-c:anon-device-score-view-select');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'vw_patient_clinical_context'
      AND c.relkind = 'v'
      AND 'security_invoker=true' = ANY(COALESCE(c.reloptions, ARRAY[]::TEXT[]))
  ) THEN
    failures := array_append(failures, 'gate-c:clinical-context-not-security-invoker');
  END IF;

  IF to_regclass('public.health_reminders') IS NULL THEN
    failures := array_append(failures, 'dependency:health-reminders-missing');
  END IF;

  IF to_regclass('public.family_members') IS NULL THEN
    failures := array_append(failures, 'dependency:family-members-missing');
  END IF;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION 'Gate D production preflight failed: %', array_to_string(failures, ', ');
  END IF;
END $$;

SELECT
  'PASS' AS concierge_production_preflight_v1,
  current_setting('server_version') AS postgres_version,
  (SELECT count(*) FROM auth.users) AS existing_auth_users,
  (SELECT count(*)
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname LIKE 'concierge_%') AS existing_concierge_objects,
  NOW() AS checked_at;
