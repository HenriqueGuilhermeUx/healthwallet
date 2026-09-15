-- =====================================================
-- HEALTHWALLET / MYDATAMED - VIEW HARDENING V3
-- STAGING FIRST. DO NOT APPLY TO PRODUCTION UNTIL GATE C APPROVAL.
-- Run AFTER SQL_PRE_CONCIERGE_SECURE_SHARING_V2.sql.
--
-- Goals:
-- - make the five Supabase-advised public views obey caller RLS;
-- - remove anonymous access to clinical/professional views;
-- - keep authenticated autocomplete catalog reads working;
-- - replace two legacy professional policies that ignored expiry/revocation/category;
-- - allow request-scoped shared clinical-context counts only when the patient
--   explicitly granted the matching V2 sharing categories.
-- =====================================================

DO $$
BEGIN
  IF to_regprocedure('private.has_health_share_access(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'Secure sharing V2 must be applied before view hardening V3';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Retire legacy professional policies that treated any used access code as
--    permanent blanket authorization.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS mu_professional_select ON public.medication_uses;
DROP POLICY IF EXISTS pc_professional_select ON public.patient_conditions;

DROP POLICY IF EXISTS professional_shared_allergies_select ON public.alergias_paciente;
CREATE POLICY professional_shared_allergies_select
  ON public.alergias_paciente
  FOR SELECT TO authenticated
  USING (
    (SELECT private.has_health_share_access(
      paciente_id,
      ARRAY['allergies','passport']::TEXT[]
    ))
  );

DROP POLICY IF EXISTS professional_shared_conditions_select ON public.patient_conditions;
CREATE POLICY professional_shared_conditions_select
  ON public.patient_conditions
  FOR SELECT TO authenticated
  USING (
    (SELECT private.has_health_share_access(
      paciente_id,
      ARRAY['passport']::TEXT[]
    ))
  );

DROP POLICY IF EXISTS professional_shared_medication_uses_select ON public.medication_uses;
CREATE POLICY professional_shared_medication_uses_select
  ON public.medication_uses
  FOR SELECT TO authenticated
  USING (
    (SELECT private.has_health_share_access(
      paciente_id,
      ARRAY['medications','passport']::TEXT[]
    ))
  );

DROP POLICY IF EXISTS professional_shared_consultations_select ON public.consultations;
CREATE POLICY professional_shared_consultations_select
  ON public.consultations
  FOR SELECT TO authenticated
  USING (
    (SELECT private.has_health_share_access(
      paciente_id,
      ARRAY['passport']::TEXT[]
    ))
  );

-- ---------------------------------------------------------------------------
-- 2. Medication autocomplete joins formas_farmaceuticas. The table already has
--    RLS enabled but had no read policy, so security_invoker would otherwise
--    silently blank/break that join for authenticated users.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS formas_farmaceuticas_authenticated_read ON public.formas_farmaceuticas;
CREATE POLICY formas_farmaceuticas_authenticated_read
  ON public.formas_farmaceuticas
  FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON TABLE public.formas_farmaceuticas TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. All five advised views obey underlying RLS on PostgreSQL 17.
-- ---------------------------------------------------------------------------
ALTER VIEW public.patient_device_score_latest SET (security_invoker = true);
ALTER VIEW public.vw_document_deliveries_public SET (security_invoker = true);
ALTER VIEW public.vw_exames_autocomplete SET (security_invoker = true);
ALTER VIEW public.vw_medicamentos_autocomplete SET (security_invoker = true);
ALTER VIEW public.vw_patient_clinical_context SET (security_invoker = true);

-- Views created under legacy Supabase defaults carried broad table-like grants.
-- Rebuild the client privilege boundary explicitly: no anonymous access; signed-in
-- callers may only SELECT, then underlying RLS determines which rows are visible.
REVOKE ALL ON TABLE
  public.patient_device_score_latest,
  public.vw_document_deliveries_public,
  public.vw_exames_autocomplete,
  public.vw_medicamentos_autocomplete,
  public.vw_patient_clinical_context
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.patient_device_score_latest,
  public.vw_document_deliveries_public,
  public.vw_exames_autocomplete,
  public.vw_medicamentos_autocomplete,
  public.vw_patient_clinical_context
TO authenticated;

-- The clinical views should never again be anonymously queryable.
REVOKE SELECT ON TABLE public.health_daily_summaries FROM anon;
REVOKE SELECT ON TABLE public.profiles FROM anon;
REVOKE SELECT ON TABLE public.alergias_paciente FROM anon;
REVOKE SELECT ON TABLE public.patient_conditions FROM anon;
REVOKE SELECT ON TABLE public.medication_uses FROM anon;
REVOKE SELECT ON TABLE public.consultations FROM anon;
REVOKE SELECT ON TABLE public.document_deliveries FROM anon;
REVOKE SELECT ON TABLE public.professionals FROM anon;

-- ---------------------------------------------------------------------------
-- 4. Verification contract.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  failures TEXT[] := ARRAY[]::TEXT[];
  target_view TEXT;
  options TEXT[];
BEGIN
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
    WHERE n.nspname='public' AND c.relname=target_view AND c.relkind='v';

    IF NOT ('security_invoker=true' = ANY(options)) THEN
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
      AND tablename='medication_uses'
      AND policyname='mu_professional_select'
  ) THEN
    failures := array_append(failures, 'legacy-policy:mu_professional_select');
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='patient_conditions'
      AND policyname='pc_professional_select'
  ) THEN
    failures := array_append(failures, 'legacy-policy:pc_professional_select');
  END IF;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION 'View hardening V3 verification failed: %', array_to_string(failures, ', ');
  END IF;
END $$;

SELECT
  'PASS' AS pre_concierge_view_hardening_v3,
  'Five advised views now use security_invoker; anonymous clinical view access is removed.' AS message;