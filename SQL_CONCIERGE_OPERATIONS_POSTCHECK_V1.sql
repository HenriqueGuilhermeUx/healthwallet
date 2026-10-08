-- ============================================================
-- HEALTHWALLET / MYDATAMED
-- CONCIERGE OPERATIONS POSTCHECK V1
-- READ ONLY. Run after Digital AI + Operations + hardening.
-- ============================================================

DO $$
DECLARE
  failures TEXT[] := ARRAY[]::TEXT[];
  t TEXT;
  exposed_functions TEXT;
  required_tables TEXT[] := ARRAY[
    'concierge_chat_sessions',
    'concierge_chat_messages',
    'concierge_operational_cases',
    'concierge_case_documents',
    'concierge_case_events',
    'concierge_regulatory_playbooks',
    'concierge_regulatory_guides',
    'concierge_channel_identities',
    'concierge_channel_link_challenges',
    'concierge_document_intake',
    'concierge_case_checklist_items',
    'concierge_case_escalations',
    'concierge_legal_authorizations',
    'concierge_entitlements'
  ];
BEGIN
  -- 1) Tables exist and have RLS.
  FOREACH t IN ARRAY required_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      failures := array_append(failures, 'missing-table:' || t);
    ELSIF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relrowsecurity
    ) THEN
      failures := array_append(failures, 'rls-disabled:' || t);
    END IF;
  END LOOP;

  -- 2) Readiness view exists.
  IF to_regclass('public.concierge_subscriber_readiness') IS NULL THEN
    failures := array_append(failures, 'missing-view:concierge_subscriber_readiness');
  END IF;

  -- 3) Required public RPC surface exists.
  IF to_regprocedure('public.concierge_chat_request_human(uuid)') IS NULL
     OR to_regprocedure('public.concierge_chat_staff_take(uuid)') IS NULL
     OR to_regprocedure('public.concierge_chat_staff_return_to_ai(uuid)') IS NULL
     OR to_regprocedure('public.concierge_create_whatsapp_link_challenge()') IS NULL
     OR to_regprocedure('public.concierge_refresh_operational_alerts_system()') IS NULL THEN
    failures := array_append(failures, 'missing-required-rpc');
  END IF;

  -- 4) Anonymous role must not read sensitive Concierge tables.
  IF has_table_privilege('anon','public.concierge_operational_cases','SELECT')
     OR has_table_privilege('anon','public.concierge_chat_sessions','SELECT')
     OR has_table_privilege('anon','public.concierge_chat_messages','SELECT')
     OR has_table_privilege('anon','public.concierge_document_intake','SELECT')
     OR has_table_privilege('anon','public.concierge_legal_authorizations','SELECT')
     OR has_table_privilege('anon','public.concierge_entitlements','SELECT') THEN
    failures := array_append(failures, 'anonymous-table-access-detected');
  END IF;

  -- 5) Anonymous role must not execute Concierge functions.
  SELECT string_agg(
    n.nspname || '.' || p.oid::regprocedure::text,
    ', ' ORDER BY n.nspname, p.oid::regprocedure::text
  )
  INTO exposed_functions
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public','private')
    AND (
      p.proname LIKE 'concierge_%'
      OR p.proname LIKE 'set_concierge_%'
    )
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF exposed_functions IS NOT NULL THEN
    failures := array_append(
      failures,
      'anonymous-function-execute:' || exposed_functions
    );
  END IF;

  -- 6) Private intake bucket must exist and stay private.
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'concierge-intake'
      AND public = false
  ) THEN
    failures := array_append(failures, 'missing-or-public-bucket:concierge-intake');
  END IF;

  -- 7) Realtime publication must include patient/staff conversation
  -- and operational event tables.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication p
    JOIN pg_publication_rel pr ON pr.prpubid = p.oid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'concierge_chat_sessions'
  ) THEN
    failures := array_append(failures, 'realtime-missing:concierge_chat_sessions');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication p
    JOIN pg_publication_rel pr ON pr.prpubid = p.oid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'concierge_chat_messages'
  ) THEN
    failures := array_append(failures, 'realtime-missing:concierge_chat_messages');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication p
    JOIN pg_publication_rel pr ON pr.prpubid = p.oid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'concierge_operational_cases'
  ) THEN
    failures := array_append(failures, 'realtime-missing:concierge_operational_cases');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication p
    JOIN pg_publication_rel pr ON pr.prpubid = p.oid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'concierge_case_events'
  ) THEN
    failures := array_append(failures, 'realtime-missing:concierge_case_events');
  END IF;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION 'Concierge Operations postcheck failed: %',
      array_to_string(failures, ', ');
  END IF;
END $$;

SELECT
  'PASS' AS concierge_operations_postcheck,
  (SELECT count(*) FROM public.concierge_regulatory_playbooks WHERE active) AS active_playbooks,
  (SELECT count(*) FROM public.concierge_regulatory_guides WHERE active) AS active_guides,
  (SELECT count(*) FROM public.concierge_operational_cases) AS operational_cases,
  (SELECT count(*) FROM public.concierge_document_intake) AS intake_documents,
  (
    SELECT count(*)
    FROM public.concierge_entitlements
    WHERE status IN ('trial','active','grace')
  ) AS active_entitlements,
  (
    SELECT count(*)
    FROM public.concierge_legal_authorizations
    WHERE status = 'signed'
  ) AS signed_legal_authorizations,
  NOW() AS checked_at;
