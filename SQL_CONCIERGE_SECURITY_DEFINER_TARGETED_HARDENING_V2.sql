-- ============================================================
-- HEALTHWALLET / MYDATAMED
-- CONCIERGE SECURITY DEFINER TARGETED HARDENING V2
-- Protects helper functions that accept arbitrary patient UUIDs
-- while preserving RLS/routing behavior.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.concierge_has_active_consent(target_patient UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller UUID := auth.uid();
  caller_is_service BOOLEAN := auth.role() = 'service_role';
  caller_is_staff BOOLEAN := false;
BEGIN
  IF target_patient IS NULL THEN
    RETURN false;
  END IF;

  IF caller IS NOT NULL THEN
    caller_is_staff := private.concierge_operations_is_staff(caller);
  END IF;

  IF NOT caller_is_service
     AND caller IS DISTINCT FROM target_patient
     AND NOT caller_is_staff THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.concierge_memberships m
    WHERE m.patient_id = target_patient
      AND m.status IN ('pilot','active')
      AND m.consent_status = 'accepted'
      AND m.consented_at IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.concierge_has_active_consent(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concierge_has_active_consent(UUID) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.concierge_reference_professional_id(
  target_patient UUID,
  target_layer TEXT
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller UUID := auth.uid();
  caller_role TEXT;
  result_id UUID;
BEGIN
  IF target_patient IS NULL
     OR target_layer NOT IN ('doctor','nurse') THEN
    RETURN NULL;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF caller IS NULL THEN
      RETURN NULL;
    END IF;

    IF caller IS DISTINCT FROM target_patient THEN
      SELECT private.concierge_operations_staff_role(caller)
      INTO caller_role;

      IF caller_role IS NULL THEN
        RETURN NULL;
      END IF;

      -- A clinician may resolve only patients they are actively assigned to.
      -- Master/admin/coordinator/Concierge Agent may resolve the portfolio.
      IF caller_role NOT IN ('master','admin','care_coordinator','concierge_agent') THEN
        IF NOT EXISTS (
          SELECT 1
          FROM public.concierge_assignments own_assignment
          WHERE own_assignment.patient_id = target_patient
            AND own_assignment.professional_id = caller
            AND own_assignment.status = 'active'
        ) THEN
          RETURN NULL;
        END IF;
      END IF;
    END IF;
  END IF;

  SELECT a.professional_id
  INTO result_id
  FROM public.concierge_assignments a
  JOIN public.concierge_staff s
    ON s.user_id = a.professional_id
  WHERE a.patient_id = target_patient
    AND a.status = 'active'
    AND a.is_primary = true
    AND s.active = true
    AND (
      (target_layer = 'doctor' AND a.role = 'doctor')
      OR
      (target_layer = 'nurse' AND a.role IN ('nurse','care_coordinator'))
    )
  ORDER BY
    CASE
      WHEN target_layer = 'nurse' AND a.role = 'nurse' THEN 0
      WHEN target_layer = 'nurse' AND a.role = 'care_coordinator' THEN 1
      ELSE 0
    END,
    a.started_at ASC
  LIMIT 1;

  RETURN result_id;
END;
$$;

REVOKE ALL ON FUNCTION public.concierge_reference_professional_id(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concierge_reference_professional_id(UUID, TEXT) TO authenticated, service_role;


-- Keep intended RPCs callable, but make the privilege contract explicit.
REVOKE ALL ON FUNCTION public.concierge_accept_consent(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concierge_accept_consent(JSONB, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.concierge_revoke_consent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concierge_revoke_consent() TO authenticated;

REVOKE ALL ON FUNCTION public.concierge_patient_reply(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concierge_patient_reply(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.concierge_get_request_context(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concierge_get_request_context(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.concierge_list_my_context_accesses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concierge_list_my_context_accesses() TO authenticated;

REVOKE ALL ON FUNCTION public.concierge_reference_team(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concierge_reference_team(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.concierge_set_primary_assignment(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concierge_set_primary_assignment(UUID, UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.concierge_refresh_time_alerts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concierge_refresh_time_alerts() TO authenticated;


-- Verification.
DO $$
DECLARE
  anon_exposed TEXT;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ')
  INTO anon_exposed
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (
      p.proname LIKE 'concierge_%'
      OR p.proname LIKE 'set_concierge_%'
    )
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF anon_exposed IS NOT NULL THEN
    RAISE EXCEPTION 'Anonymous Concierge function exposure remains: %', anon_exposed;
  END IF;
END $$;

COMMIT;

SELECT
  'PASS' AS concierge_security_definer_targeted_hardening_v2,
  NOW() AS checked_at;
