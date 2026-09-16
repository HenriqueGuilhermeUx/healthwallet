-- =====================================================
-- HEALTHWALLET / MYDATAMED - CONCIERGE PRODUCTION POSTCHECK V1
-- READ ONLY. RUN AFTER COMPAT + 15 CANONICAL CONCIERGE MIGRATIONS.
-- =====================================================

DO $$
DECLARE
  failures TEXT[] := ARRAY[]::TEXT[];
  operational_rows BIGINT;
  program_count BIGINT;
  rule_count BIGINT;
  target_table TEXT;
BEGIN
  IF to_regclass('public.concierge_staff') IS NULL
     OR to_regclass('public.concierge_memberships') IS NULL
     OR to_regclass('public.concierge_requests') IS NULL
     OR to_regprocedure('public.concierge_has_active_consent(uuid)') IS NULL
     OR to_regprocedure('public.concierge_can_access_request(uuid)') IS NULL
     OR to_regprocedure('public.concierge_accept_consent(jsonb,text)') IS NULL
     OR to_regprocedure('public.concierge_get_request_context(uuid)') IS NULL
     OR to_regprocedure('public.concierge_patient_reply(uuid,text)') IS NULL
     OR to_regprocedure('public.concierge_reference_team(uuid)') IS NULL THEN
    failures := array_append(failures, 'required-concierge-contract-missing');
  END IF;

  FOREACH target_table IN ARRAY ARRAY[
    'concierge_staff','concierge_memberships','concierge_assignments',
    'concierge_requests','concierge_request_events','concierge_actions',
    'concierge_programs','concierge_program_enrollments','concierge_alerts',
    'concierge_work_logs','concierge_consent_events','concierge_rules',
    'concierge_context_access_logs','concierge_clinical_reviews'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public'
        AND c.relname=target_table
        AND c.relkind IN ('r','p')
        AND c.relrowsecurity
    ) THEN
      failures := array_append(failures, 'rls-missing:' || target_table);
    END IF;

    IF has_table_privilege('anon', format('public.%I', target_table), 'SELECT')
       OR has_table_privilege('anon', format('public.%I', target_table), 'INSERT')
       OR has_table_privilege('anon', format('public.%I', target_table), 'UPDATE')
       OR has_table_privilege('anon', format('public.%I', target_table), 'DELETE') THEN
      failures := array_append(failures, 'anon-table-privilege:' || target_table);
    END IF;
  END LOOP;

  SELECT
    (SELECT count(*) FROM public.concierge_staff)
    + (SELECT count(*) FROM public.concierge_memberships)
    + (SELECT count(*) FROM public.concierge_assignments)
    + (SELECT count(*) FROM public.concierge_requests)
    + (SELECT count(*) FROM public.concierge_request_events)
    + (SELECT count(*) FROM public.concierge_actions)
    + (SELECT count(*) FROM public.concierge_program_enrollments)
    + (SELECT count(*) FROM public.concierge_alerts)
    + (SELECT count(*) FROM public.concierge_work_logs)
    + (SELECT count(*) FROM public.concierge_consent_events)
    + (SELECT count(*) FROM public.concierge_context_access_logs)
    + (SELECT count(*) FROM public.concierge_clinical_reviews)
  INTO operational_rows;

  IF operational_rows <> 0 THEN
    failures := array_append(failures, 'unexpected-operational-rows:' || operational_rows);
  END IF;

  SELECT count(*) INTO program_count FROM public.concierge_programs;
  SELECT count(*) INTO rule_count FROM public.concierge_rules;

  IF program_count < 8 THEN
    failures := array_append(failures, 'program-catalog-incomplete:' || program_count);
  END IF;

  IF rule_count < 4 THEN
    failures := array_append(failures, 'rule-catalog-incomplete:' || rule_count);
  END IF;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION 'Gate D production postcheck failed: %', array_to_string(failures, ', ');
  END IF;
END $$;

SELECT
  'PASS' AS concierge_production_postcheck_v1,
  (SELECT count(*) FROM public.concierge_programs) AS program_catalog_rows,
  (SELECT count(*) FROM public.concierge_rules) AS rule_catalog_rows,
  0 AS expected_operational_rows,
  NOW() AS checked_at;
