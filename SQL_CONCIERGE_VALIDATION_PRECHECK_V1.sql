-- =====================================================
-- HEALTH CONCIERGE - VALIDATION PRECHECK V1
-- VALIDATION ENVIRONMENT ONLY.
-- Run after all Concierge migrations and BEFORE seeding personas / E2E.
-- This script is read-only: it only verifies that the validation schema is ready.
-- =====================================================

DO $$
DECLARE
  missing_objects TEXT;
BEGIN
  WITH required_objects(kind, object_name, present) AS (
    VALUES
      ('table', 'concierge_staff', to_regclass('public.concierge_staff') IS NOT NULL),
      ('table', 'concierge_memberships', to_regclass('public.concierge_memberships') IS NOT NULL),
      ('table', 'concierge_assignments', to_regclass('public.concierge_assignments') IS NOT NULL),
      ('table', 'concierge_requests', to_regclass('public.concierge_requests') IS NOT NULL),
      ('table', 'concierge_request_events', to_regclass('public.concierge_request_events') IS NOT NULL),
      ('table', 'concierge_actions', to_regclass('public.concierge_actions') IS NOT NULL),
      ('table', 'concierge_programs', to_regclass('public.concierge_programs') IS NOT NULL),
      ('table', 'concierge_program_enrollments', to_regclass('public.concierge_program_enrollments') IS NOT NULL),
      ('table', 'concierge_alerts', to_regclass('public.concierge_alerts') IS NOT NULL),
      ('table', 'concierge_consent_events', to_regclass('public.concierge_consent_events') IS NOT NULL),
      ('table', 'concierge_context_access_logs', to_regclass('public.concierge_context_access_logs') IS NOT NULL),
      ('table', 'concierge_clinical_reviews', to_regclass('public.concierge_clinical_reviews') IS NOT NULL),
      ('table', 'concierge_work_logs', to_regclass('public.concierge_work_logs') IS NOT NULL),
      ('function', 'concierge_has_active_consent(uuid)', to_regprocedure('public.concierge_has_active_consent(uuid)') IS NOT NULL),
      ('function', 'concierge_can_access_patient(uuid)', to_regprocedure('public.concierge_can_access_patient(uuid)') IS NOT NULL),
      ('function', 'concierge_can_access_request(uuid)', to_regprocedure('public.concierge_can_access_request(uuid)') IS NOT NULL),
      ('function', 'concierge_accept_consent(jsonb,text)', to_regprocedure('public.concierge_accept_consent(jsonb,text)') IS NOT NULL),
      ('function', 'concierge_revoke_consent()', to_regprocedure('public.concierge_revoke_consent()') IS NOT NULL),
      ('function', 'concierge_get_request_context(uuid)', to_regprocedure('public.concierge_get_request_context(uuid)') IS NOT NULL),
      ('function', 'concierge_list_my_context_accesses()', to_regprocedure('public.concierge_list_my_context_accesses()') IS NOT NULL),
      ('function', 'concierge_set_primary_assignment(uuid,uuid,text)', to_regprocedure('public.concierge_set_primary_assignment(uuid,uuid,text)') IS NOT NULL),
      ('function', 'concierge_patient_reply(uuid,text)', to_regprocedure('public.concierge_patient_reply(uuid,text)') IS NOT NULL),
      ('function', 'concierge_reference_team(uuid)', to_regprocedure('public.concierge_reference_team(uuid)') IS NOT NULL),
      ('function', 'concierge_refresh_time_alerts()', to_regprocedure('public.concierge_refresh_time_alerts()') IS NOT NULL)
  )
  SELECT string_agg(kind || ':' || object_name, ', ' ORDER BY kind, object_name)
    INTO missing_objects
  FROM required_objects
  WHERE NOT present;

  IF missing_objects IS NOT NULL THEN
    RAISE EXCEPTION 'Concierge validation precheck failed. Missing: %', missing_objects;
  END IF;
END $$;

-- All clinical/operational Concierge tables must have RLS enabled.
DO $$
DECLARE
  rls_missing TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO rls_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY(ARRAY[
      'concierge_staff',
      'concierge_memberships',
      'concierge_assignments',
      'concierge_requests',
      'concierge_request_events',
      'concierge_actions',
      'concierge_programs',
      'concierge_program_enrollments',
      'concierge_alerts',
      'concierge_consent_events',
      'concierge_context_access_logs',
      'concierge_clinical_reviews',
      'concierge_work_logs'
    ])
    AND c.relrowsecurity = false;

  IF rls_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Concierge validation precheck failed. RLS disabled on: %', rls_missing;
  END IF;
END $$;

-- Guard against accidentally broad authenticated policies in the Concierge domain.
DO $$
DECLARE
  unsafe_policies TEXT;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname)
    INTO unsafe_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename LIKE 'concierge_%'
    AND (
      regexp_replace(COALESCE(qual, ''), '\\s+', '', 'g') IN ('true','(true)')
      OR regexp_replace(COALESCE(with_check, ''), '\\s+', '', 'g') IN ('true','(true)')
    );

  IF unsafe_policies IS NOT NULL THEN
    RAISE EXCEPTION 'Concierge validation precheck failed. Unrestricted policy found: %', unsafe_policies;
  END IF;
END $$;

-- Verify the most important constraints/columns introduced by later migrations.
DO $$
DECLARE
  failures TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='concierge_memberships' AND column_name='consent_status'
  ) THEN failures := array_append(failures, 'concierge_memberships.consent_status'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='concierge_memberships' AND column_name='has_health_plan'
  ) THEN failures := array_append(failures, 'concierge_memberships.has_health_plan'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='concierge_requests' AND column_name='subject_family_member_id'
  ) THEN failures := array_append(failures, 'concierge_requests.subject_family_member_id'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='concierge_requests' AND column_name='first_response_at'
  ) THEN failures := array_append(failures, 'concierge_requests.first_response_at'); END IF;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION 'Concierge validation precheck failed. Missing migrated fields: %', array_to_string(failures, ', ');
  END IF;
END $$;

-- Reference-team routing triggers are part of the continuity promise.
DO $$
DECLARE
  missing_triggers TEXT;
BEGIN
  WITH expected(trigger_name) AS (
    VALUES
      ('trg_10_concierge_reference_team_route'),
      ('trg_20_concierge_guard_clinician_assignment')
  )
  SELECT string_agg(e.trigger_name, ', ' ORDER BY e.trigger_name)
    INTO missing_triggers
  FROM expected e
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'concierge_requests'
      AND t.tgname = e.trigger_name
      AND NOT t.tgisinternal
  );

  IF missing_triggers IS NOT NULL THEN
    RAISE EXCEPTION 'Concierge validation precheck failed. Missing routing triggers: %', missing_triggers;
  END IF;
END $$;

SELECT
  'PASS' AS validation_precheck,
  NOW() AS checked_at,
  'Schema, functions, RLS and reference-team routing are ready for controlled Concierge validation.' AS message;
