-- =====================================================
-- HEALTHWALLET / MYDATAMED - CONCIERGE SECURITY HARDENING V1
-- Run after Concierge Digital AI + Concierge Operations.
-- Atomic: any failure rolls back the whole hardening block.
-- =====================================================

BEGIN;

-- 1) Remove anonymous/default execution from every Concierge function
-- in both public and private schemas.
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name, p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','private')
      AND (
        p.proname LIKE 'concierge_%'
        OR p.proname LIKE 'set_concierge_%'
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s.%s FROM PUBLIC',
      quote_ident(fn.schema_name),
      fn.signature
    );

    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s.%s FROM anon',
      quote_ident(fn.schema_name),
      fn.signature
    );
  END LOOP;
END $$;

-- 2) Trigger functions are implementation details, not callable RPCs.
-- Existing triggers remain bound after direct authenticated EXECUTE is revoked.
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name, p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','private')
      AND (
        p.proname LIKE 'concierge_%'
        OR p.proname LIKE 'set_concierge_%'
      )
      AND p.prorettype = 'pg_catalog.trigger'::regtype
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s.%s FROM authenticated',
      quote_ident(fn.schema_name),
      fn.signature
    );
  END LOOP;
END $$;

-- 3) Pin search_path on Concierge trigger functions.
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name, p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','private')
      AND (
        p.proname LIKE 'concierge_%'
        OR p.proname LIKE 'set_concierge_%'
      )
      AND p.prorettype = 'pg_catalog.trigger'::regtype
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s.%s SET search_path = %s',
      quote_ident(fn.schema_name),
      fn.signature,
      CASE WHEN fn.schema_name = 'private' THEN quote_literal('') ELSE quote_literal('public') END
    );
  END LOOP;
END $$;

-- 4) Private schema must never be callable anonymously.
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- 5) Verification: anon must not execute any Concierge function.
DO $$
DECLARE
  exposed TEXT;
  trigger_exposed TEXT;
BEGIN
  SELECT string_agg(
    n.nspname || '.' || p.oid::regprocedure::text,
    ', ' ORDER BY n.nspname, p.oid::regprocedure::text
  )
  INTO exposed
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public','private')
    AND (
      p.proname LIKE 'concierge_%'
      OR p.proname LIKE 'set_concierge_%'
    )
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF exposed IS NOT NULL THEN
    RAISE EXCEPTION 'Concierge hardening failed: anon EXECUTE remains on %', exposed;
  END IF;

  SELECT string_agg(
    n.nspname || '.' || p.oid::regprocedure::text,
    ', ' ORDER BY n.nspname, p.oid::regprocedure::text
  )
  INTO trigger_exposed
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public','private')
    AND (
      p.proname LIKE 'concierge_%'
      OR p.proname LIKE 'set_concierge_%'
    )
    AND p.prorettype = 'pg_catalog.trigger'::regtype
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  IF trigger_exposed IS NOT NULL THEN
    RAISE EXCEPTION 'Concierge hardening failed: trigger RPC exposure remains on %', trigger_exposed;
  END IF;
END $$;

COMMIT;

SELECT
  'PASS' AS concierge_security_hardening_v1,
  NOW() AS checked_at;
