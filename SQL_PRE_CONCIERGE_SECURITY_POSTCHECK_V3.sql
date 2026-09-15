-- =====================================================
-- HEALTHWALLET / MYDATAMED - PRE-CONCIERGE SECURITY POSTCHECK V3
-- READ ONLY. RUN ONLY AFTER V1 -> V2 -> V3 HAVE BEEN APPLIED.
--
-- Purpose:
-- Prove the production database actually reached the expected hardened state
-- before any Concierge production schema is installed.
-- This file performs no DDL or DML.
-- =====================================================

DO $$
DECLARE
  failures TEXT[] := ARRAY[]::TEXT[];
  target_view TEXT;
  options TEXT[];
BEGIN
  -- Concierge must still be absent at this stage. Security hardening is a
  -- prerequisite and is deliberately released before the Concierge schema.
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public'
      AND c.relkind IN ('r','p','v','m')
      AND c.relname LIKE 'concierge_%'
  ) THEN
    failures := array_append(failures, 'concierge-schema-installed-too-early');
  END IF;

  -- V1: key privileged functions exist with an explicit safe search_path.
  IF COALESCE((
    SELECT array_to_string(p.proconfig, ',')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname='create_access_code'
      AND pg_get_function_identity_arguments(p.oid)='p_patient_id uuid, p_permissions jsonb, p_duration_hours integer'
  ), '') NOT LIKE '%search_path=public, pg_temp%' THEN
    failures := array_append(failures, 'create_access_code-search-path');
  END IF;

  IF COALESCE((
    SELECT array_to_string(p.proconfig, ',')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname='start_mydatamed_pro_trial'
      AND pg_get_function_identity_arguments(p.oid)='p_professional_user_id uuid, p_professional_id uuid'
  ), '') NOT LIKE '%search_path=public, pg_temp%' THEN
    failures := array_append(failures, 'start_mydatamed_pro_trial-search-path');
  END IF;

  IF COALESCE((
    SELECT array_to_string(p.proconfig, ',')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname='upsert_health_daily_summary'
  ), '') NOT LIKE '%search_path=public, pg_temp%' THEN
    failures := array_append(failures, 'upsert_health_daily_summary-search-path');
  END IF;

  IF has_function_privilege('anon', 'public.create_access_code(uuid,jsonb,integer)', 'EXECUTE') THEN
    failures := array_append(failures, 'anon:create_access_code');
  END IF;
  IF has_function_privilege('anon', 'public.start_mydatamed_pro_trial(uuid,uuid)', 'EXECUTE') THEN
    failures := array_append(failures, 'anon:start_mydatamed_pro_trial');
  END IF;
  IF has_function_privilege(
    'anon',
    'public.upsert_health_daily_summary(uuid,date,text[],integer,integer,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb)',
    'EXECUTE'
  ) THEN
    failures := array_append(failures, 'anon:upsert_health_daily_summary');
  END IF;
  IF has_function_privilege('authenticated', 'public.activate_mydatamed_pro_after_payment(uuid,uuid,uuid)', 'EXECUTE') THEN
    failures := array_append(failures, 'authenticated:activate_mydatamed_pro_after_payment');
  END IF;
  IF has_function_privilege('authenticated', 'public.record_mydatamed_usage(uuid,text,integer,text,uuid,text,jsonb)', 'EXECUTE') THEN
    failures := array_append(failures, 'authenticated:record_mydatamed_usage');
  END IF;

  -- V2: strong professional-bound sharing contract.
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='access_codes'
      AND column_name='code' AND data_type='text'
  ) THEN
    failures := array_append(failures, 'access_codes.code-not-text');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='access_codes' AND column_name='code_version'
  ) THEN
    failures := array_append(failures, 'access_codes.code_version-missing');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='access_codes' AND column_name='redeemed_at'
  ) THEN
    failures := array_append(failures, 'access_codes.redeemed_at-missing');
  END IF;

  IF to_regprocedure('public.create_health_access_code(jsonb,integer)') IS NULL THEN
    failures := array_append(failures, 'create_health_access_code-missing');
  END IF;
  IF to_regprocedure('public.redeem_health_access_code(text)') IS NULL THEN
    failures := array_append(failures, 'redeem_health_access_code-missing');
  END IF;
  IF to_regprocedure('private.has_health_share_access(uuid,text[])') IS NULL THEN
    failures := array_append(failures, 'has_health_share_access-missing');
  END IF;

  IF has_function_privilege('anon', 'public.create_health_access_code(jsonb,integer)', 'EXECUTE') THEN
    failures := array_append(failures, 'anon:create_health_access_code');
  END IF;
  IF has_function_privilege('anon', 'public.redeem_health_access_code(text)', 'EXECUTE') THEN
    failures := array_append(failures, 'anon:redeem_health_access_code');
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.create_health_access_code(jsonb,integer)', 'EXECUTE') THEN
    failures := array_append(failures, 'missing-auth:create_health_access_code');
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.redeem_health_access_code(text)', 'EXECUTE') THEN
    failures := array_append(failures, 'missing-auth:redeem_health_access_code');
  END IF;

  IF has_table_privilege('anon', 'public.access_codes', 'SELECT') THEN
    failures := array_append(failures, 'anon:access_codes-select');
  END IF;
  IF has_table_privilege('anon', 'public.shared_access', 'SELECT') THEN
    failures := array_append(failures, 'anon:shared_access-select');
  END IF;
  IF has_table_privilege('authenticated', 'public.access_codes', 'INSERT') THEN
    failures := array_append(failures, 'authenticated:direct-access-code-insert');
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND (
        (tablename='health_summaries' AND policyname='Allow shared health_summaries')
        OR (tablename='health_scores' AND policyname='Allow shared health_scores')
        OR (tablename='medical_records' AND policyname='Allow shared medical_records')
        OR (tablename='medications' AND policyname='Allow shared medications')
        OR (tablename='medical_events' AND policyname='Allow shared medical_events')
        OR (tablename='shared_access' AND policyname='Public can read valid shared access by code')
      )
  ) THEN
    failures := array_append(failures, 'legacy-bearer-sharing-policy-present');
  END IF;

  -- V3: all five advised views use invoker semantics and expose no SELECT to anon.
  FOREACH target_view IN ARRAY ARRAY[
    'patient_device_score_latest',
    'vw_document_deliveries_public',
    'vw_exames_autocomplete',
    'vw_medicamentos_autocomplete',
    'vw_patient_clinical_context'
  ] LOOP
    SELECT COALESCE(c.reloptions, ARRAY[]::TEXT[])
      INTO options
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relname=target_view
      AND c.relkind='v';

    IF options IS NULL OR NOT ('security_invoker=true' = ANY(options)) THEN
      failures := array_append(failures, 'not-security-invoker:' || target_view);
    END IF;

    IF has_table_privilege('anon', format('public.%I', target_view), 'SELECT') THEN
      failures := array_append(failures, 'anon-view-select:' || target_view);
    END IF;

    IF NOT has_table_privilege('authenticated', format('public.%I', target_view), 'SELECT') THEN
      failures := array_append(failures, 'missing-auth-view-select:' || target_view);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND (
        (tablename='medication_uses' AND policyname='mu_professional_select')
        OR (tablename='patient_conditions' AND policyname='pc_professional_select')
      )
  ) THEN
    failures := array_append(failures, 'legacy-professional-sharing-policy-present');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='medication_uses'
      AND policyname='professional_shared_medication_uses_select'
  ) THEN
    failures := array_append(failures, 'professional-shared-medication-policy-missing');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='patient_conditions'
      AND policyname='professional_shared_conditions_select'
  ) THEN
    failures := array_append(failures, 'professional-shared-condition-policy-missing');
  END IF;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION 'Pre-Concierge security postcheck V3 failed: %', array_to_string(failures, ', ');
  END IF;
END $$;

SELECT
  'PASS' AS pre_concierge_security_postcheck_v3,
  NOW() AS checked_at,
  'V1/V2/V3 hardened state is present and Concierge production schema is still absent.' AS message;