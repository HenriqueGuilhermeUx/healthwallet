-- =====================================================
-- HEALTH CONCIERGE - VALIDATION SESSION DIAGNOSTICS V1
-- VALIDATION ENVIRONMENT ONLY.
-- NOT part of the 15 canonical Concierge migrations.
-- NEVER apply to production.
--
-- Purpose:
-- prove what PostgreSQL session state an authenticated PostgREST request sees
-- while diagnosing validation-only authorization behavior.
-- =====================================================

CREATE OR REPLACE FUNCTION public.concierge_validation_session_diagnostics()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'auth_uid', auth.uid(),
    'current_user', current_user,
    'session_user', session_user,
    'role_setting', current_setting('role', true),
    'session_replication_role', current_setting('session_replication_role', true),
    'jwt_role', current_setting('request.jwt.claim.role', true),
    'jwt_claims', current_setting('request.jwt.claims', true)
  );
$$;

REVOKE ALL ON FUNCTION public.concierge_validation_session_diagnostics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_validation_session_diagnostics() TO authenticated;

SELECT 'PASS' AS validation_session_diagnostics_ready;
