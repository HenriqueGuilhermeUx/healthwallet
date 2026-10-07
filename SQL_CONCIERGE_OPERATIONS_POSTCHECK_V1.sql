-- ============================================================
-- HEALTHWALLET / MYDATAMED
-- CONCIERGE OPERATIONS POSTCHECK V1
-- READ ONLY. Run after Digital AI + Operations + hardening.
-- ============================================================

DO $$
DECLARE
  failures TEXT[] := ARRAY[]::TEXT[];
  t TEXT;
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

  IF to_regclass('public.concierge_subscriber_readiness') IS NULL THEN
    failures := array_append(failures, 'missing-view:concierge_subscriber_readiness');
  END IF;

  IF to_regprocedure('public.concierge_chat_request_human(uuid)') IS NULL
     OR to_regprocedure('public.concierge_chat_staff_take(uuid)') IS NULL
     OR to_regprocedure('public.concierge_chat_staff_return_to_ai(uuid)') IS NULL
     OR to_regprocedure('public.concierge_create_whatsapp_link_challenge()') IS NULL
     OR to_regprocedure('public.concierge_refresh_operational_alerts_system()') IS NULL THEN
    failures := array_append(failures, 'missing-required-rpc');
  END IF;

  IF has_table_privilege('anon','public.concierge_operational_cases','SELECT')
     OR has_table_privilege('anon','public.concierge_chat_sessions','SELECT')
     OR has_table_privilege('anon','public.concierge_document_intake','SELECT')
     OR has_table_privilege('anon','public.concierge_legal_authorizations','SELECT') THEN
    failures := array_append(failures, 'anonymous-table-access-detected');
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
  NOW() AS checked_at;
