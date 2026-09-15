-- =====================================================
-- HEALTHWALLET / MYDATAMED - SECURE HEALTH SHARING V2
-- STAGING FIRST. DO NOT APPLY TO PRODUCTION UNTIL GATE C APPROVAL.
--
-- Replaces the legacy anonymous six-digit bearer-code model with:
-- - cryptographically strong patient-created tokens;
-- - authenticated, non-anonymous professional redemption;
-- - one professional binding per access token;
-- - category-scoped RLS for the exact patient who granted access;
-- - patient-visible redemption audit;
-- - no anonymous clinical-table access through shared_access.
--
-- Existing six-digit codes are preserved for patient history/revocation but are
-- marked code_version=1 and cannot be redeemed by the V2 professional flow.
-- =====================================================

CREATE SCHEMA IF NOT EXISTS private;

-- ---------------------------------------------------------------------------
-- 1. Evolve access_codes without destroying legacy rows.
-- ---------------------------------------------------------------------------
ALTER TABLE public.access_codes
  ALTER COLUMN code TYPE TEXT USING btrim(code);

ALTER TABLE public.access_codes
  ADD COLUMN IF NOT EXISTS code_version SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE public.access_codes
  ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_access_codes_code
  ON public.access_codes(code);

CREATE INDEX IF NOT EXISTS idx_access_codes_professional_active
  ON public.access_codes(professional_id, patient_id, expires_at)
  WHERE professional_id IS NOT NULL AND COALESCE(revoked, false) = false;

-- Successful redemption audit. No clinical payload is stored here.
CREATE TABLE IF NOT EXISTS public.health_share_access_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  access_code_id UUID NOT NULL REFERENCES public.access_codes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('redeemed')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

ALTER TABLE public.health_share_access_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.health_share_access_audit_logs FROM anon, authenticated;
GRANT SELECT ON TABLE public.health_share_access_audit_logs TO authenticated;

DROP POLICY IF EXISTS health_share_audit_patient_select ON public.health_share_access_audit_logs;
CREATE POLICY health_share_audit_patient_select
  ON public.health_share_access_audit_logs
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = patient_id);

DROP POLICY IF EXISTS health_share_audit_professional_select ON public.health_share_access_audit_logs;
CREATE POLICY health_share_audit_professional_select
  ON public.health_share_access_audit_logs
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = professional_user_id);

-- ---------------------------------------------------------------------------
-- 2. Private authorization helpers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.current_health_professional_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id
  FROM public.professionals p
  WHERE p.user_id = (SELECT auth.uid())
    AND COALESCE(p.verification_status, 'pending') NOT IN ('rejected', 'suspended')
  ORDER BY
    CASE COALESCE(p.verification_status, 'pending')
      WHEN 'verified' THEN 0
      WHEN 'self_declared' THEN 1
      WHEN 'pending' THEN 2
      ELSE 3
    END,
    p.created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.current_health_professional_id() FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_health_professional_id() TO authenticated;

CREATE OR REPLACE FUNCTION private.has_health_share_access(
  target_patient UUID,
  required_categories TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.access_codes ac
    JOIN public.professionals p ON p.id = ac.professional_id
    WHERE p.user_id = (SELECT auth.uid())
      AND COALESCE(p.verification_status, 'pending') NOT IN ('rejected', 'suspended')
      AND ac.patient_id = target_patient
      AND ac.code_version = 2
      AND ac.professional_id IS NOT NULL
      AND ac.redeemed_at IS NOT NULL
      AND COALESCE(ac.revoked, false) = false
      AND ac.expires_at > NOW()
      AND EXISTS (
        SELECT 1
        FROM unnest(required_categories) AS category
        WHERE ac.permissions -> category = 'true'::JSONB
           OR ac.share_categories -> category = 'true'::JSONB
      )
  );
$$;

REVOKE ALL ON FUNCTION private.has_health_share_access(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_health_share_access(UUID, TEXT[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Private mutation functions + public SECURITY INVOKER wrappers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.create_health_access_code(
  p_permissions JSONB,
  p_duration_hours INTEGER
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  permissions JSONB,
  share_categories JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  revoked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_token TEXT;
  v_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_created_at TIMESTAMPTZ;
  v_allowed_keys CONSTANT TEXT[] := ARRAY[
    'summary','profile','medscore','exams','ai_analysis','medications',
    'allergies','passport','emergency_contact','health_plan','family_history'
  ];
BEGIN
  IF v_user_id IS NULL OR COALESCE((auth.jwt() ->> 'is_anonymous')::BOOLEAN, false) THEN
    RAISE EXCEPTION 'authenticated_patient_required';
  END IF;

  IF p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'object' THEN
    RAISE EXCEPTION 'invalid_permissions';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each(p_permissions) e
    WHERE e.key <> ALL(v_allowed_keys)
       OR jsonb_typeof(e.value) <> 'boolean'
  ) THEN
    RAISE EXCEPTION 'invalid_permission_key_or_value';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_each(p_permissions) e WHERE e.value = 'true'::JSONB
  ) THEN
    RAISE EXCEPTION 'at_least_one_permission_required';
  END IF;

  IF p_duration_hours IS NULL OR p_duration_hours < 1 OR p_duration_hours > 720 THEN
    RAISE EXCEPTION 'invalid_duration';
  END IF;

  v_expires_at := NOW() + make_interval(hours => p_duration_hours);
  v_token := 'HW-' || upper(encode(extensions.gen_random_bytes(18), 'hex'));

  INSERT INTO public.access_codes (
    code,
    patient_id,
    permissions,
    share_categories,
    expires_at,
    revoked,
    code_version,
    professional_id,
    used_at,
    redeemed_at
  ) VALUES (
    v_token,
    v_user_id,
    p_permissions,
    p_permissions,
    v_expires_at,
    false,
    2,
    NULL,
    NULL,
    NULL
  )
  RETURNING access_codes.id, access_codes.created_at
  INTO v_id, v_created_at;

  RETURN QUERY
  SELECT
    v_id,
    v_token,
    p_permissions,
    p_permissions,
    v_expires_at,
    v_created_at,
    false;
END;
$$;

REVOKE ALL ON FUNCTION private.create_health_access_code(JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_health_access_code(JSONB, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_health_access_code(
  p_permissions JSONB,
  p_duration_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  permissions JSONB,
  share_categories JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  revoked BOOLEAN
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM private.create_health_access_code(p_permissions, p_duration_hours);
$$;

REVOKE ALL ON FUNCTION public.create_health_access_code(JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_health_access_code(JSONB, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION private.redeem_health_access_code(p_code TEXT)
RETURNS TABLE (
  access_code_id UUID,
  patient_id UUID,
  permissions JSONB,
  expires_at TIMESTAMPTZ,
  professional_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_professional_id UUID;
  v_access public.access_codes%ROWTYPE;
  v_first_redemption BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL OR COALESCE((auth.jwt() ->> 'is_anonymous')::BOOLEAN, false) THEN
    RAISE EXCEPTION 'authenticated_professional_required';
  END IF;

  SELECT private.current_health_professional_id()
    INTO v_professional_id;

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'professional_profile_required';
  END IF;

  SELECT ac.*
    INTO v_access
  FROM public.access_codes ac
  WHERE ac.code = upper(trim(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_access_code';
  END IF;

  IF v_access.code_version <> 2 THEN
    RAISE EXCEPTION 'legacy_access_code_not_supported';
  END IF;

  IF COALESCE(v_access.revoked, false) THEN
    RAISE EXCEPTION 'access_code_revoked';
  END IF;

  IF v_access.expires_at <= NOW() THEN
    RAISE EXCEPTION 'access_code_expired';
  END IF;

  IF v_access.professional_id IS NOT NULL
     AND v_access.professional_id <> v_professional_id THEN
    RAISE EXCEPTION 'access_code_already_redeemed';
  END IF;

  IF v_access.professional_id IS NULL THEN
    v_first_redemption := true;

    UPDATE public.access_codes
    SET
      professional_id = v_professional_id,
      used_at = COALESCE(used_at, NOW()),
      redeemed_at = COALESCE(redeemed_at, NOW())
    WHERE id = v_access.id;

    INSERT INTO public.health_share_access_audit_logs (
      patient_id,
      professional_user_id,
      professional_id,
      access_code_id,
      event_type,
      metadata
    ) VALUES (
      v_access.patient_id,
      v_user_id,
      v_professional_id,
      v_access.id,
      'redeemed',
      jsonb_build_object('code_version', 2)
    );
  END IF;

  RETURN QUERY
  SELECT
    v_access.id,
    v_access.patient_id,
    COALESCE(v_access.share_categories, v_access.permissions, '{}'::JSONB),
    v_access.expires_at,
    v_professional_id;
END;
$$;

REVOKE ALL ON FUNCTION private.redeem_health_access_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.redeem_health_access_code(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_health_access_code(p_code TEXT)
RETURNS TABLE (
  access_code_id UUID,
  patient_id UUID,
  permissions JSONB,
  expires_at TIMESTAMPTZ,
  professional_id UUID
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM private.redeem_health_access_code(p_code);
$$;

REVOKE ALL ON FUNCTION public.redeem_health_access_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_health_access_code(TEXT) TO authenticated;

-- Close the legacy weak-code RPC path for client roles. Service-side compatibility
-- may still call it until the old path is fully retired.
REVOKE ALL ON FUNCTION public.create_access_code(UUID, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_access_code(UUID, JSONB, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.generate_access_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_access_code() TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Access-code table RLS: patient owns; exactly one professional may read.
-- ---------------------------------------------------------------------------
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own access codes" ON public.access_codes;
DROP POLICY IF EXISTS codes_insert ON public.access_codes;
DROP POLICY IF EXISTS codes_patient ON public.access_codes;
DROP POLICY IF EXISTS codes_select ON public.access_codes;
DROP POLICY IF EXISTS access_codes_patient_or_professional_select ON public.access_codes;
DROP POLICY IF EXISTS access_codes_patient_update ON public.access_codes;
DROP POLICY IF EXISTS access_codes_patient_delete ON public.access_codes;

REVOKE ALL ON TABLE public.access_codes FROM anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE public.access_codes TO authenticated;

CREATE POLICY access_codes_patient_or_professional_select
  ON public.access_codes
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = patient_id
    OR professional_id = (SELECT private.current_health_professional_id())
  );

CREATE POLICY access_codes_patient_update
  ON public.access_codes
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = patient_id)
  WITH CHECK ((SELECT auth.uid()) = patient_id);

CREATE POLICY access_codes_patient_delete
  ON public.access_codes
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = patient_id);

-- ---------------------------------------------------------------------------
-- 5. Retire shared_access as a public bearer authorization mechanism.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can read valid shared access by code" ON public.shared_access;
REVOKE SELECT ON TABLE public.shared_access FROM anon;

DROP POLICY IF EXISTS shared_access_patient_select ON public.shared_access;
CREATE POLICY shared_access_patient_select
  ON public.shared_access
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = patient_id);

-- ---------------------------------------------------------------------------
-- 6. Replace broad "there exists some shared_access" policies with the exact
--    professional + patient + category authorization grant.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow shared health_summaries" ON public.health_summaries;
DROP POLICY IF EXISTS "Allow shared health_scores" ON public.health_scores;
DROP POLICY IF EXISTS "Allow shared medical_events" ON public.medical_events;
DROP POLICY IF EXISTS "Allow shared medical_records" ON public.medical_records;
DROP POLICY IF EXISTS "Allow shared medications" ON public.medications;

DROP POLICY IF EXISTS professional_shared_profile_select ON public.profiles;
CREATE POLICY professional_shared_profile_select
  ON public.profiles
  FOR SELECT TO authenticated
  USING (
    (SELECT private.has_health_share_access(
      id,
      ARRAY['profile','passport','allergies','emergency_contact','family_history']::TEXT[]
    ))
  );

DROP POLICY IF EXISTS professional_shared_summary_select ON public.health_summaries;
CREATE POLICY professional_shared_summary_select
  ON public.health_summaries
  FOR SELECT TO authenticated
  USING ((SELECT private.has_health_share_access(user_id, ARRAY['summary']::TEXT[])));

DROP POLICY IF EXISTS professional_shared_score_select ON public.health_scores;
CREATE POLICY professional_shared_score_select
  ON public.health_scores
  FOR SELECT TO authenticated
  USING ((SELECT private.has_health_share_access(user_id, ARRAY['medscore']::TEXT[])));

DROP POLICY IF EXISTS professional_shared_records_select ON public.medical_records;
CREATE POLICY professional_shared_records_select
  ON public.medical_records
  FOR SELECT TO authenticated
  USING ((SELECT private.has_health_share_access(user_id, ARRAY['exams','ai_analysis']::TEXT[])));

DROP POLICY IF EXISTS professional_shared_medications_select ON public.medications;
CREATE POLICY professional_shared_medications_select
  ON public.medications
  FOR SELECT TO authenticated
  USING ((SELECT private.has_health_share_access(user_id, ARRAY['medications']::TEXT[])));

DROP POLICY IF EXISTS professional_shared_health_plan_select ON public.health_plans;
CREATE POLICY professional_shared_health_plan_select
  ON public.health_plans
  FOR SELECT TO authenticated
  USING ((SELECT private.has_health_share_access(user_id, ARRAY['health_plan']::TEXT[])));

DROP POLICY IF EXISTS professional_shared_events_select ON public.medical_events;
CREATE POLICY professional_shared_events_select
  ON public.medical_events
  FOR SELECT TO authenticated
  USING ((SELECT private.has_health_share_access(user_id, ARRAY['passport']::TEXT[])));

-- The public bearer-code page is retired by the frontend change that accompanies
-- this migration. Anonymous visitors no longer need SELECT on these clinical tables.
REVOKE SELECT ON TABLE
  public.profiles,
  public.health_summaries,
  public.health_scores,
  public.medical_records,
  public.medications,
  public.health_plans,
  public.medical_events
FROM anon;

-- ---------------------------------------------------------------------------
-- 7. Verification contract.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  failures TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF has_table_privilege('anon', 'public.access_codes', 'SELECT') THEN
    failures := array_append(failures, 'anon:access_codes');
  END IF;

  IF has_table_privilege('anon', 'public.shared_access', 'SELECT') THEN
    failures := array_append(failures, 'anon:shared_access');
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

  IF has_table_privilege('authenticated', 'public.access_codes', 'INSERT') THEN
    failures := array_append(failures, 'direct-auth-insert:access_codes');
  END IF;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION 'Secure health sharing V2 verification failed: %', array_to_string(failures, ', ');
  END IF;
END $$;

SELECT
  'PASS' AS secure_health_sharing_v2,
  'New sharing is professional-authenticated, patient-bound, category-scoped and non-anonymous.' AS message;