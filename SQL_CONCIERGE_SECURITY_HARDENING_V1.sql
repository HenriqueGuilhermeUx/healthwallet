-- =====================================================
-- HEALTHWALLET / MYDATAMED - CONCIERGE SECURITY HARDENING V1
-- Production-safe follow-up after Gate D schema creation.
-- Purpose:
--   1) Remove anonymous execution from every Concierge function.
--   2) Prevent trigger-only functions from being exposed as authenticated RPCs.
--   3) Pin search_path on the two trigger functions flagged by Security Advisor.
-- Client-facing/authz helper RPCs intentionally keep authenticated EXECUTE.
-- =====================================================

-- Supabase/Postgres function defaults may grant EXECUTE broadly. Concierge has no
-- anonymous RPC contract, so fail closed for every function in this namespace.
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'concierge_%'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn.signature);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn.signature);
  END LOOP;
END $$;

-- Trigger functions are implementation details, not Data API RPC endpoints.
-- PostgreSQL requires EXECUTE when a trigger is created; the existing triggers are
-- already bound. Revoking direct role EXECUTE removes the exposed RPC surface.
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'concierge_%'
      AND p.prorettype = 'pg_catalog.trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn.signature);
  END LOOP;
END $$;

-- set_concierge_updated_at is also trigger-only but does not use the concierge_
-- prefix, so harden it explicitly.
REVOKE EXECUTE ON FUNCTION public.set_concierge_updated_at() FROM PUBLIC, anon, authenticated;

-- Security Advisor: pin function search paths.
ALTER FUNCTION public.set_concierge_updated_at() SET search_path = public;
ALTER FUNCTION public.concierge_set_first_response() SET search_path = public;

-- Verification: no anonymous caller may execute any Concierge function.
DO $$
DECLARE
  exposed TEXT;
  trigger_exposed TEXT;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO exposed
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname LIKE 'concierge_%'
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF exposed IS NOT NULL THEN
    RAISE EXCEPTION 'Concierge hardening failed: anon EXECUTE remains on %', exposed;
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO trigger_exposed
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname LIKE 'concierge_%'
    AND p.prorettype = 'pg_catalog.trigger'::regtype
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  IF trigger_exposed IS NOT NULL THEN
    RAISE EXCEPTION 'Concierge hardening failed: trigger RPC exposure remains on %', trigger_exposed;
  END IF;
END $$;

SELECT
  'PASS' AS concierge_security_hardening_v1,
  NOW() AS checked_at;
