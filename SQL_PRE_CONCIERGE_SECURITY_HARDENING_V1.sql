-- =====================================================
-- HEALTHWALLET / MYDATAMED - PRE-CONCIERGE SECURITY HARDENING V1
-- REVIEW / STAGING FIRST. DO NOT APPLY TO PRODUCTION UNTIL THE RELEASE GATE.
--
-- Scope of this migration:
-- 1) fix mutable search_path on current public functions flagged by Supabase;
-- 2) remove anonymous/public EXECUTE from SECURITY DEFINER RPCs;
-- 3) preserve authenticated user flows only where the function itself enforces
--    the caller's identity;
-- 4) keep billing/usage mutation helpers service-role/internal only;
-- 5) close the NULL auth.uid() bypass in upsert_health_daily_summary.
--
-- This file intentionally DOES NOT change SECURITY DEFINER views. View hardening
-- is a separate gate because each view needs an explicit underlying RLS contract.
-- =====================================================

-- ---------------------------------------------------------------------------
-- A. Identity-safe access-code creation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_access_code(
  p_patient_id UUID,
  p_permissions JSONB,
  p_duration_hours INTEGER DEFAULT 24
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_code TEXT;
  new_id UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_patient_id THEN
      RAISE EXCEPTION 'not_allowed';
    END IF;
  END IF;

  IF p_duration_hours IS NULL OR p_duration_hours < 1 OR p_duration_hours > 168 THEN
    RAISE EXCEPTION 'invalid_duration';
  END IF;

  new_code := public.generate_access_code();

  INSERT INTO public.access_codes (code, patient_id, permissions, expires_at)
  VALUES (
    new_code,
    p_patient_id,
    COALESCE(p_permissions, '{}'::jsonb),
    NOW() + make_interval(hours => p_duration_hours)
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_access_code(UUID, JSONB, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_access_code(UUID, JSONB, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_access_code(UUID, JSONB, INTEGER) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- B. Identity-safe MyDataMed Pro trial activation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_mydatamed_pro_trial(
  p_professional_user_id UUID,
  p_professional_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_subscription_id UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_professional_user_id THEN
      RAISE EXCEPTION 'not_allowed';
    END IF;

    IF p_professional_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.professionals p
         WHERE p.id = p_professional_id
           AND p.user_id = auth.uid()
       ) THEN
      RAISE EXCEPTION 'professional_not_owned_by_caller';
    END IF;
  END IF;

  INSERT INTO public.professional_subscriptions (
    professional_user_id,
    professional_id,
    plan_name,
    plan_price_cents,
    monthly_price_cents,
    billing_cycle,
    status,
    free_patient_data_access,
    commercial_area_enabled,
    trial_days,
    trial_started_at,
    trial_ends_at,
    current_period_starts_at,
    current_period_ends_at,
    features
  ) VALUES (
    p_professional_user_id,
    p_professional_id,
    'MyDataMed Pro',
    7990,
    7990,
    'monthly',
    'trial',
    true,
    true,
    15,
    NOW(),
    NOW() + INTERVAL '15 days',
    NOW(),
    NOW() + INTERVAL '15 days',
    '{"free_patient_data_access":true,"teleconsultation":true,"google_calendar_meet":true,"crm_bots":true,"payments_nextgen":true,"documents_signature":true}'::jsonb
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_subscription_id;

  INSERT INTO public.professional_feature_access (
    professional_user_id,
    professional_id,
    feature_key,
    access_level,
    enabled,
    starts_at,
    ends_at,
    source
  )
  VALUES
    (p_professional_user_id, p_professional_id, 'patient_data_access_free', 'free', true, NOW(), NULL, 'system'),
    (p_professional_user_id, p_professional_id, 'teleconsultation', 'trial', true, NOW(), NOW() + INTERVAL '15 days', 'trial'),
    (p_professional_user_id, p_professional_id, 'google_calendar_meet', 'trial', true, NOW(), NOW() + INTERVAL '15 days', 'trial'),
    (p_professional_user_id, p_professional_id, 'crm_smartbots', 'trial', true, NOW(), NOW() + INTERVAL '15 days', 'trial'),
    (p_professional_user_id, p_professional_id, 'payments_nextgen_woovi', 'trial', true, NOW(), NOW() + INTERVAL '15 days', 'trial'),
    (p_professional_user_id, p_professional_id, 'professional_documents', 'trial', true, NOW(), NOW() + INTERVAL '15 days', 'trial'),
    (p_professional_user_id, p_professional_id, 'commercial_dashboard', 'trial', true, NOW(), NOW() + INTERVAL '15 days', 'trial')
  ON CONFLICT (professional_user_id, feature_key)
  DO UPDATE SET
    access_level = EXCLUDED.access_level,
    enabled = EXCLUDED.enabled,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    source = EXCLUDED.source,
    updated_at = NOW();

  RETURN v_subscription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_mydatamed_pro_trial(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_mydatamed_pro_trial(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_mydatamed_pro_trial(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- C. Identity-safe device summary RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_health_daily_summary(
  p_user_id UUID,
  p_summary_date DATE,
  p_sources TEXT[] DEFAULT '{}'::TEXT[],
  p_data_points INTEGER DEFAULT 0,
  p_steps INTEGER DEFAULT NULL,
  p_sleep_minutes INTEGER DEFAULT NULL,
  p_resting_heart_rate NUMERIC DEFAULT NULL,
  p_avg_heart_rate NUMERIC DEFAULT NULL,
  p_hrv_avg NUMERIC DEFAULT NULL,
  p_spo2_avg NUMERIC DEFAULT NULL,
  p_systolic_bp NUMERIC DEFAULT NULL,
  p_diastolic_bp NUMERIC DEFAULT NULL,
  p_weight_kg NUMERIC DEFAULT NULL,
  p_temperature_c NUMERIC DEFAULT NULL,
  p_active_calories NUMERIC DEFAULT NULL,
  p_activity_minutes NUMERIC DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'not_allowed';
    END IF;
  END IF;

  INSERT INTO public.health_daily_summaries (
    user_id,
    summary_date,
    sources,
    data_points,
    steps,
    sleep_minutes,
    resting_heart_rate,
    avg_heart_rate,
    hrv_avg,
    spo2_avg,
    systolic_bp,
    diastolic_bp,
    weight_kg,
    temperature_c,
    active_calories,
    activity_minutes,
    metadata,
    last_sync_at
  ) VALUES (
    p_user_id,
    p_summary_date,
    COALESCE(p_sources, '{}'),
    COALESCE(p_data_points, 0),
    p_steps,
    p_sleep_minutes,
    p_resting_heart_rate,
    p_avg_heart_rate,
    p_hrv_avg,
    p_spo2_avg,
    p_systolic_bp,
    p_diastolic_bp,
    p_weight_kg,
    p_temperature_c,
    p_active_calories,
    p_activity_minutes,
    COALESCE(p_metadata, '{}'::jsonb),
    NOW()
  )
  ON CONFLICT (user_id, summary_date)
  DO UPDATE SET
    sources = ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(public.health_daily_summaries.sources, '{}') || COALESCE(EXCLUDED.sources, '{}')
      )
    ),
    data_points = GREATEST(public.health_daily_summaries.data_points, EXCLUDED.data_points),
    steps = COALESCE(EXCLUDED.steps, public.health_daily_summaries.steps),
    sleep_minutes = COALESCE(EXCLUDED.sleep_minutes, public.health_daily_summaries.sleep_minutes),
    resting_heart_rate = COALESCE(EXCLUDED.resting_heart_rate, public.health_daily_summaries.resting_heart_rate),
    avg_heart_rate = COALESCE(EXCLUDED.avg_heart_rate, public.health_daily_summaries.avg_heart_rate),
    hrv_avg = COALESCE(EXCLUDED.hrv_avg, public.health_daily_summaries.hrv_avg),
    spo2_avg = COALESCE(EXCLUDED.spo2_avg, public.health_daily_summaries.spo2_avg),
    systolic_bp = COALESCE(EXCLUDED.systolic_bp, public.health_daily_summaries.systolic_bp),
    diastolic_bp = COALESCE(EXCLUDED.diastolic_bp, public.health_daily_summaries.diastolic_bp),
    weight_kg = COALESCE(EXCLUDED.weight_kg, public.health_daily_summaries.weight_kg),
    temperature_c = COALESCE(EXCLUDED.temperature_c, public.health_daily_summaries.temperature_c),
    active_calories = COALESCE(EXCLUDED.active_calories, public.health_daily_summaries.active_calories),
    activity_minutes = COALESCE(EXCLUDED.activity_minutes, public.health_daily_summaries.activity_minutes),
    metadata = public.health_daily_summaries.metadata || EXCLUDED.metadata,
    last_sync_at = NOW(),
    updated_at = NOW()
  RETURNING id INTO v_id;

  INSERT INTO public.health_data_audit_logs (
    patient_id,
    actor_user_id,
    actor_role,
    action,
    data_category,
    source_app,
    reference_table,
    reference_id,
    metadata
  ) VALUES (
    p_user_id,
    COALESCE(auth.uid(), p_user_id),
    CASE WHEN auth.role() = 'service_role' THEN 'system' ELSE 'patient' END,
    'device_daily_summary_upserted',
    'device_data',
    'healthwallet',
    'health_daily_summaries',
    v_id,
    jsonb_build_object('summary_date', p_summary_date, 'sources', p_sources)
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_health_daily_summary(
  UUID, DATE, TEXT[], INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_health_daily_summary(
  UUID, DATE, TEXT[], INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB
) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_health_daily_summary(
  UUID, DATE, TEXT[], INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- D. Fix search_path on current public functions flagged by the database linter.
-- Trigger functions remain callable by their triggers after direct API EXECUTE
-- privileges are removed.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.generate_access_code() SET search_path = public, pg_temp;
ALTER FUNCTION public.create_access_code(UUID, JSONB, INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_medicamento_search() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_receita_safety(INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_clinical_alerts(UUID, INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION public.set_telemedicine_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at_generic() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_professional_documents_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_sign_tokens_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.expire_old_sign_tokens() SET search_path = public, pg_temp;
ALTER FUNCTION public.start_mydatamed_pro_trial(UUID, UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.activate_mydatamed_pro_after_payment(UUID, UUID, UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_precheck_submission_count() SET search_path = public, pg_temp;
ALTER FUNCTION public.record_mydatamed_usage(UUID, TEXT, INTEGER, TEXT, UUID, TEXT, JSONB) SET search_path = public, pg_temp;
ALTER FUNCTION public.on_clinical_visit_record_mydatamed_usage() SET search_path = public, pg_temp;
ALTER FUNCTION public.sign_and_lock_clinical_visit(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.hw_set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.hw_clamp_int(NUMERIC, INTEGER, INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION public.calculate_device_context_score(INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, INTEGER, TIMESTAMPTZ) SET search_path = public, pg_temp;
ALTER FUNCTION public.recalculate_health_daily_summary_score() SET search_path = public, pg_temp;
ALTER FUNCTION public.hw_email_inbox_set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.ensure_health_inbound_email_address(UUID, TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.mark_health_inbox_forwarding_verified(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.upsert_health_daily_summary(
  UUID, DATE, TEXT[], INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB
) SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- E. Least-privilege EXECUTE matrix for SECURITY DEFINER functions
-- ---------------------------------------------------------------------------
-- Payment/webhook/internal usage helpers must never be directly callable by
-- anonymous or ordinary authenticated clients.
REVOKE ALL ON FUNCTION public.activate_mydatamed_pro_after_payment(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_mydatamed_pro_after_payment(UUID, UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_mydatamed_pro_after_payment(UUID, UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.record_mydatamed_usage(UUID, TEXT, INTEGER, TEXT, UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_mydatamed_usage(UUID, TEXT, INTEGER, TEXT, UUID, TEXT, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_mydatamed_usage(UUID, TEXT, INTEGER, TEXT, UUID, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.on_clinical_visit_record_mydatamed_usage() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.on_clinical_visit_record_mydatamed_usage() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.on_clinical_visit_record_mydatamed_usage() TO service_role;

-- Patient/professional self-service RPCs keep authenticated access but never anon.
REVOKE ALL ON FUNCTION public.ensure_health_inbound_email_address(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_health_inbound_email_address(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_health_inbound_email_address(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mark_health_inbox_forwarding_verified(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_health_inbox_forwarding_verified(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_health_inbox_forwarding_verified(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.sign_and_lock_clinical_visit(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sign_and_lock_clinical_visit(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.sign_and_lock_clinical_visit(UUID) TO authenticated, service_role;

-- Explicitly remove direct API execution from trigger-only helpers. Triggers keep
-- functioning because the function owner/trigger path is unaffected by these API grants.
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_medicamento_search() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_telemedicine_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at_generic() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_professional_documents_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_sign_tokens_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_precheck_submission_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hw_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_health_daily_summary_score() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hw_email_inbox_set_updated_at() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- F. Read-only verification contract
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  failures TEXT[] := ARRAY[]::TEXT[];
BEGIN
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
  IF NOT has_function_privilege('authenticated', 'public.create_access_code(uuid,jsonb,integer)', 'EXECUTE') THEN
    failures := array_append(failures, 'missing-auth:create_access_code');
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.start_mydatamed_pro_trial(uuid,uuid)', 'EXECUTE') THEN
    failures := array_append(failures, 'missing-auth:start_mydatamed_pro_trial');
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.sign_and_lock_clinical_visit(uuid)', 'EXECUTE') THEN
    failures := array_append(failures, 'missing-auth:sign_and_lock_clinical_visit');
  END IF;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION 'Pre-Concierge security hardening verification failed: %', array_to_string(failures, ', ');
  END IF;
END $$;

SELECT
  'PASS' AS pre_concierge_security_hardening_v1,
  'Function search_path and SECURITY DEFINER EXECUTE boundaries are explicit. View hardening remains a separate gate.' AS message;