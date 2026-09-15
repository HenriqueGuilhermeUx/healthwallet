-- =====================================================
-- HEALTHWALLET / MYDATAMED - PRE-CONCIERGE SECURITY PREFLIGHT V1
-- READ ONLY. SAFE TO RUN AGAINST THE CURRENT HEALTHWALLET DATABASE.
--
-- Purpose:
-- Prove that SQL_PRE_CONCIERGE_SECURITY_HARDENING_V1.sql still matches the
-- live schema before any security DDL is reviewed for staging/production.
-- This file performs no INSERT/UPDATE/DELETE/DDL and changes no privileges.
-- =====================================================

DO $$
DECLARE
  missing_functions TEXT;
BEGIN
  WITH expected(signature) AS (
    VALUES
      ('public.generate_access_code()'),
      ('public.create_access_code(uuid,jsonb,integer)'),
      ('public.set_updated_at()'),
      ('public.update_medicamento_search()'),
      ('public.check_receita_safety(integer)'),
      ('public.check_clinical_alerts(uuid,integer)'),
      ('public.set_telemedicine_updated_at()'),
      ('public.set_updated_at_generic()'),
      ('public.set_professional_documents_updated_at()'),
      ('public.set_sign_tokens_updated_at()'),
      ('public.expire_old_sign_tokens()'),
      ('public.start_mydatamed_pro_trial(uuid,uuid)'),
      ('public.activate_mydatamed_pro_after_payment(uuid,uuid,uuid)'),
      ('public.increment_precheck_submission_count()'),
      ('public.record_mydatamed_usage(uuid,text,integer,text,uuid,text,jsonb)'),
      ('public.on_clinical_visit_record_mydatamed_usage()'),
      ('public.sign_and_lock_clinical_visit(uuid)'),
      ('public.hw_set_updated_at()'),
      ('public.hw_clamp_int(numeric,integer,integer)'),
      ('public.calculate_device_context_score(integer,integer,numeric,numeric,numeric,numeric,numeric,numeric,integer,timestamp with time zone)'),
      ('public.recalculate_health_daily_summary_score()'),
      ('public.hw_email_inbox_set_updated_at()'),
      ('public.ensure_health_inbound_email_address(uuid,text)'),
      ('public.mark_health_inbox_forwarding_verified(uuid)'),
      ('public.upsert_health_daily_summary(uuid,date,text[],integer,integer,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb)')
  )
  SELECT string_agg(signature, ', ' ORDER BY signature)
    INTO missing_functions
  FROM expected
  WHERE to_regprocedure(signature) IS NULL;

  IF missing_functions IS NOT NULL THEN
    RAISE EXCEPTION 'Pre-Concierge security preflight failed. Missing/changed function signatures: %', missing_functions;
  END IF;
END $$;

DO $$
DECLARE
  missing_views TEXT;
BEGIN
  WITH expected(view_name) AS (
    VALUES
      ('patient_device_score_latest'),
      ('vw_document_deliveries_public'),
      ('vw_exames_autocomplete'),
      ('vw_medicamentos_autocomplete'),
      ('vw_patient_clinical_context')
  )
  SELECT string_agg(view_name, ', ' ORDER BY view_name)
    INTO missing_views
  FROM expected
  WHERE to_regclass('public.' || view_name) IS NULL;

  IF missing_views IS NOT NULL THEN
    RAISE EXCEPTION 'Pre-Concierge security preflight failed. Missing security-review views: %', missing_views;
  END IF;
END $$;

DO $$
DECLARE
  failures TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF to_regclass('public.health_daily_summaries') IS NULL THEN
    failures := array_append(failures, 'health_daily_summaries');
  END IF;
  IF to_regclass('public.health_data_audit_logs') IS NULL THEN
    failures := array_append(failures, 'health_data_audit_logs');
  END IF;
  IF to_regclass('public.access_codes') IS NULL THEN
    failures := array_append(failures, 'access_codes');
  END IF;
  IF to_regclass('public.professionals') IS NULL THEN
    failures := array_append(failures, 'professionals');
  END IF;
  IF to_regclass('public.professional_subscriptions') IS NULL THEN
    failures := array_append(failures, 'professional_subscriptions');
  END IF;
  IF to_regclass('public.professional_feature_access') IS NULL THEN
    failures := array_append(failures, 'professional_feature_access');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='professionals' AND column_name='user_id'
  ) THEN
    failures := array_append(failures, 'professionals.user_id');
  END IF;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION 'Pre-Concierge security preflight failed. Missing hardening dependencies: %', array_to_string(failures, ', ');
  END IF;
END $$;

-- The five views under review must still be ordinary views and must not already
-- have an explicit security_invoker option. If that changes, re-review V2 rather
-- than blindly applying stale assumptions.
DO $$
DECLARE
  changed_views TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO changed_views
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY(ARRAY[
      'patient_device_score_latest',
      'vw_document_deliveries_public',
      'vw_exames_autocomplete',
      'vw_medicamentos_autocomplete',
      'vw_patient_clinical_context'
    ])
    AND (
      c.relkind <> 'v'
      OR COALESCE(c.reloptions, ARRAY[]::TEXT[]) && ARRAY['security_invoker=true']::TEXT[]
    );

  IF changed_views IS NOT NULL THEN
    RAISE EXCEPTION 'Pre-Concierge security preflight detected already-changed view security semantics: %', changed_views;
  END IF;
END $$;

-- Underlying RLS contracts used by the view-hardening review must still exist.
DO $$
DECLARE
  rls_missing TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO rls_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public'
    AND c.relname = ANY(ARRAY[
      'health_daily_summaries',
      'profiles',
      'alergias_paciente',
      'patient_conditions',
      'medication_uses',
      'consultations',
      'document_deliveries',
      'professionals',
      'exames_tuss',
      'medicamentos',
      'principios_ativos',
      'laboratorios',
      'formas_farmaceuticas'
    ])
    AND NOT c.relrowsecurity;

  IF rls_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Pre-Concierge security preflight failed. Expected RLS missing on: %', rls_missing;
  END IF;
END $$;

-- Baseline only: surface, but do not mutate, the current EXECUTE exposure of the
-- nine privileged functions that Gate C is intended to narrow.
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  p.prosecdef AS security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  COALESCE(array_to_string(p.proconfig, ','), '') AS function_config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname = ANY(ARRAY[
    'activate_mydatamed_pro_after_payment',
    'create_access_code',
    'ensure_health_inbound_email_address',
    'mark_health_inbox_forwarding_verified',
    'on_clinical_visit_record_mydatamed_usage',
    'record_mydatamed_usage',
    'sign_and_lock_clinical_visit',
    'start_mydatamed_pro_trial',
    'upsert_health_daily_summary'
  ])
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

SELECT
  'PASS' AS pre_concierge_security_preflight_v1,
  NOW() AS checked_at,
  'Live schema matches the branch hardening assumptions. No database state was changed.' AS message;