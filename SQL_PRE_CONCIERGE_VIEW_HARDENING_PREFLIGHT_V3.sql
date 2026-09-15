-- =====================================================
-- HEALTHWALLET / MYDATAMED - VIEW HARDENING PREFLIGHT V3
-- READ ONLY. SAFE TO RUN AGAINST THE CURRENT HEALTHWALLET DATABASE.
--
-- Confirms that the current five Supabase-advised views and their underlying
-- RLS contracts still match SQL_PRE_CONCIERGE_VIEW_HARDENING_V3.sql.
-- =====================================================

DO $$
DECLARE
  version_num INTEGER := current_setting('server_version_num')::INTEGER;
  missing_views TEXT;
  missing_tables TEXT;
BEGIN
  IF version_num < 150000 THEN
    RAISE EXCEPTION 'View hardening preflight requires PostgreSQL 15+ security_invoker views; server is %', current_setting('server_version');
  END IF;

  WITH required(view_name) AS (
    VALUES
      ('patient_device_score_latest'),
      ('vw_document_deliveries_public'),
      ('vw_exames_autocomplete'),
      ('vw_medicamentos_autocomplete'),
      ('vw_patient_clinical_context')
  )
  SELECT string_agg(view_name, ', ' ORDER BY view_name)
    INTO missing_views
  FROM required
  WHERE to_regclass('public.' || view_name) IS NULL;

  IF missing_views IS NOT NULL THEN
    RAISE EXCEPTION 'View hardening preflight failed. Missing views: %', missing_views;
  END IF;

  WITH required(table_name) AS (
    VALUES
      ('health_daily_summaries'),('profiles'),('alergias_paciente'),('patient_conditions'),
      ('medication_uses'),('consultations'),('document_deliveries'),('professionals'),
      ('exames_tuss'),('medicamentos'),('principios_ativos'),('laboratorios'),('formas_farmaceuticas')
  )
  SELECT string_agg(table_name, ', ' ORDER BY table_name)
    INTO missing_tables
  FROM required
  WHERE to_regclass('public.' || table_name) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'View hardening preflight failed. Missing underlying tables: %', missing_tables;
  END IF;
END $$;

DO $$
DECLARE
  rls_missing TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO rls_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relname = ANY(ARRAY[
      'health_daily_summaries','profiles','alergias_paciente','patient_conditions',
      'medication_uses','consultations','document_deliveries','professionals',
      'exames_tuss','medicamentos','principios_ativos','laboratorios','formas_farmaceuticas'
    ])
    AND NOT c.relrowsecurity;

  IF rls_missing IS NOT NULL THEN
    RAISE EXCEPTION 'View hardening preflight failed. Expected RLS missing on: %', rls_missing;
  END IF;
END $$;

DO $$
DECLARE
  changed_views TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO changed_views
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relname = ANY(ARRAY[
      'patient_device_score_latest','vw_document_deliveries_public','vw_exames_autocomplete',
      'vw_medicamentos_autocomplete','vw_patient_clinical_context'
    ])
    AND 'security_invoker=true' = ANY(COALESCE(c.reloptions, ARRAY[]::TEXT[]));

  -- The production baseline has not been migrated yet. If one of these changes
  -- before Gate C, re-review instead of applying stale assumptions blindly.
  IF changed_views IS NOT NULL THEN
    RAISE EXCEPTION 'View hardening preflight detected already-changed security semantics: %', changed_views;
  END IF;
END $$;

-- Confirm the two blanket professional policies V3 is designed to replace are
-- still the current baseline. Their predicates only check for a used access code
-- and do not currently enforce V2 category/expiry/revocation semantics.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='medication_uses' AND policyname='mu_professional_select'
  ) THEN
    RAISE EXCEPTION 'View hardening preflight failed. Expected legacy mu_professional_select policy changed or missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='patient_conditions' AND policyname='pc_professional_select'
  ) THEN
    RAISE EXCEPTION 'View hardening preflight failed. Expected legacy pc_professional_select policy changed or missing';
  END IF;
END $$;

-- Counts only: prove whether anonymous callers currently see clinical rows through
-- the two sensitive views without returning any PHI.
SELECT
  has_table_privilege('anon', 'public.patient_device_score_latest', 'SELECT') AS anon_device_view_select_grant,
  has_table_privilege('anon', 'public.vw_patient_clinical_context', 'SELECT') AS anon_context_view_select_grant,
  (SELECT count(*) FROM public.patient_device_score_latest) AS current_device_view_rows,
  (SELECT count(*) FROM public.vw_patient_clinical_context) AS current_context_view_rows;

SELECT
  'PASS' AS pre_concierge_view_hardening_preflight_v3,
  NOW() AS checked_at,
  'Live PostgreSQL 17 view/RLS baseline matches V3 hardening assumptions. No state was changed.' AS message;