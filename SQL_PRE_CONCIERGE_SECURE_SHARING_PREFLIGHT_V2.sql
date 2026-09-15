-- =====================================================
-- HEALTHWALLET / MYDATAMED - SECURE HEALTH SHARING PREFLIGHT V2
-- READ ONLY. SAFE TO RUN AGAINST THE CURRENT HEALTHWALLET DATABASE.
--
-- Verifies that SQL_PRE_CONCIERGE_SECURE_SHARING_V2.sql still matches the live
-- schema before any DDL is reviewed for staging/production.
-- =====================================================

DO $$
DECLARE
  missing_tables TEXT;
BEGIN
  WITH required(table_name) AS (
    VALUES
      ('access_codes'),
      ('shared_access'),
      ('professionals'),
      ('profiles'),
      ('health_summaries'),
      ('health_scores'),
      ('medical_records'),
      ('medications'),
      ('health_plans'),
      ('medical_events')
  )
  SELECT string_agg(table_name, ', ' ORDER BY table_name)
    INTO missing_tables
  FROM required
  WHERE to_regclass('public.' || table_name) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Secure sharing preflight failed. Missing tables: %', missing_tables;
  END IF;
END $$;

DO $$
DECLARE
  missing_columns TEXT;
BEGIN
  WITH required(table_name, column_name) AS (
    VALUES
      ('access_codes','id'),
      ('access_codes','code'),
      ('access_codes','patient_id'),
      ('access_codes','professional_id'),
      ('access_codes','permissions'),
      ('access_codes','share_categories'),
      ('access_codes','expires_at'),
      ('access_codes','used_at'),
      ('access_codes','revoked'),
      ('access_codes','revoked_at'),
      ('professionals','id'),
      ('professionals','user_id'),
      ('professionals','verification_status'),
      ('shared_access','patient_id'),
      ('shared_access','access_code'),
      ('shared_access','permissions'),
      ('shared_access','expires_at'),
      ('profiles','id'),
      ('health_summaries','user_id'),
      ('health_scores','user_id'),
      ('medical_records','user_id'),
      ('medications','user_id'),
      ('health_plans','user_id'),
      ('medical_events','user_id')
  )
  SELECT string_agg(table_name || '.' || column_name, ', ' ORDER BY table_name, column_name)
    INTO missing_columns
  FROM required r
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema='public'
      AND c.table_name=r.table_name
      AND c.column_name=r.column_name
  );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Secure sharing preflight failed. Missing columns: %', missing_columns;
  END IF;
END $$;

DO $$
DECLARE
  extension_schema TEXT;
  duplicate_codes BIGINT;
  duplicate_professional_users BIGINT;
BEGIN
  SELECT n.nspname
    INTO extension_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid=e.extnamespace
  WHERE e.extname='pgcrypto';

  IF extension_schema IS DISTINCT FROM 'extensions' THEN
    RAISE EXCEPTION 'Secure sharing preflight failed. Expected pgcrypto in extensions schema, got %', extension_schema;
  END IF;

  SELECT count(*)
    INTO duplicate_codes
  FROM (
    SELECT btrim(code::TEXT)
    FROM public.access_codes
    GROUP BY btrim(code::TEXT)
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_codes > 0 THEN
    RAISE EXCEPTION 'Secure sharing preflight failed. Duplicate access-code values block the unique token index: %', duplicate_codes;
  END IF;

  SELECT count(*)
    INTO duplicate_professional_users
  FROM (
    SELECT user_id
    FROM public.professionals
    GROUP BY user_id
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_professional_users > 0 THEN
    RAISE EXCEPTION 'Secure sharing preflight failed. Multiple professional rows share one auth user: %', duplicate_professional_users;
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
      'access_codes','shared_access','profiles','health_summaries','health_scores',
      'medical_records','medications','health_plans','medical_events'
    ])
    AND NOT c.relrowsecurity;

  IF rls_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Secure sharing preflight failed. Expected RLS missing on: %', rls_missing;
  END IF;
END $$;

-- Baseline visibility only; no data is returned. These counts document why V2
-- must retire anonymous bearer authorization before a real Concierge pilot.
SELECT
  (SELECT count(*) FROM public.access_codes) AS access_code_rows,
  (SELECT count(*) FROM public.shared_access) AS shared_access_rows,
  has_table_privilege('anon', 'public.access_codes', 'SELECT') AS anon_can_select_access_codes,
  has_table_privilege('anon', 'public.shared_access', 'SELECT') AS anon_can_select_shared_access,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='health_summaries'
      AND policyname='Allow shared health_summaries'
  ) AS legacy_shared_summary_policy_present;

SELECT
  'PASS' AS secure_health_sharing_preflight_v2,
  NOW() AS checked_at,
  'Live schema matches the secure-sharing V2 migration assumptions. No state was changed.' AS message;