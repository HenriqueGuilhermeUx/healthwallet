-- ============================================================
-- HEALTHWALLET / MYDATAMED
-- CONCIERGE DIGITAL + OPERATIONS PREFLIGHT V1
-- READ ONLY. Run before SQL_CONCIERGE_DIGITAL_AI_V1.sql.
-- ============================================================

DO $$
DECLARE
  failures TEXT[] := ARRAY[]::TEXT[];
  t TEXT;
  required_tables TEXT[] := ARRAY[
    'family_members',
    'concierge_memberships',
    'concierge_requests',
    'concierge_request_events',
    'concierge_alerts',
    'concierge_staff'
  ];
BEGIN
  FOREACH t IN ARRAY required_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      failures := array_append(failures, 'missing-table:' || t);
    END IF;
  END LOOP;

  IF to_regclass('storage.objects') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
    failures := array_append(failures, 'missing-supabase-storage-schema');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    failures := array_append(failures, 'missing-supabase-realtime-publication');
  END IF;

  IF to_regprocedure('gen_random_uuid()') IS NULL THEN
    failures := array_append(failures, 'missing-gen-random-uuid');
  END IF;

  IF to_regprocedure('digest(text,text)') IS NULL
     AND to_regprocedure('digest(bytea,text)') IS NULL THEN
    failures := array_append(failures, 'missing-pgcrypto-digest');
  END IF;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION 'Concierge Digital/Operations preflight failed: %',
      array_to_string(failures, ', ');
  END IF;
END $$;

SELECT
  'PASS' AS concierge_digital_operations_preflight,
  to_regclass('public.family_members') IS NOT NULL AS family_members,
  to_regclass('public.concierge_memberships') IS NOT NULL AS concierge_memberships,
  to_regclass('public.concierge_requests') IS NOT NULL AS concierge_requests,
  to_regclass('public.concierge_staff') IS NOT NULL AS concierge_staff,
  to_regclass('public.concierge_chat_sessions') IS NOT NULL AS digital_chat_already_installed,
  to_regclass('public.concierge_operational_cases') IS NOT NULL AS operations_already_installed,
  NOW() AS checked_at;
