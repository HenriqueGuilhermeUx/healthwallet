-- =====================================================
-- HEALTH CONCIERGE - REFERENCE TEAM ROUTING V1
-- VALIDATION ENVIRONMENT ONLY.
-- Run after SQL_CONCIERGE_PATIENT_REPLY_ROUTING_V1.sql.
--
-- Goal:
-- - new patient request -> primary nurse/care coordinator when available
-- - medical escalation -> primary reference physician when available
-- - keep unassigned queue only as a deliberate fallback
-- - prevent ordinary clinicians from assigning another clinician arbitrarily
-- =====================================================

-- Canonical lookup used by both routing and the final fail-closed RLS policy.
-- target_layer accepts 'nurse' (nurse/care coordinator continuity layer) or
-- 'doctor' (medical reference layer).
CREATE OR REPLACE FUNCTION public.concierge_reference_professional_id(
  target_patient UUID,
  target_layer TEXT
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.professional_id
  FROM public.concierge_assignments a
  JOIN public.concierge_staff s ON s.user_id = a.professional_id
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
$$;

REVOKE ALL ON FUNCTION public.concierge_reference_professional_id(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_reference_professional_id(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.concierge_route_reference_team()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reference_nurse UUID;
  reference_doctor UUID;
BEGIN
  -- New patient cases should preserve continuity with the assigned care manager.
  IF TG_OP = 'INSERT' AND NEW.assigned_nurse_id IS NULL THEN
    reference_nurse := public.concierge_reference_professional_id(NEW.patient_id, 'nurse');
    NEW.assigned_nurse_id := reference_nurse;
  END IF;

  -- When a nurse escalates, prefer the patient's reference physician.
  IF TG_OP = 'UPDATE'
     AND NEW.assigned_doctor_id IS NULL
     AND NEW.status IN ('escalated_medical','medical_review')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    reference_doctor := public.concierge_reference_professional_id(NEW.patient_id, 'doctor');
    NEW.assigned_doctor_id := reference_doctor;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_10_concierge_reference_team_route ON public.concierge_requests;
CREATE TRIGGER trg_10_concierge_reference_team_route
BEFORE INSERT OR UPDATE ON public.concierge_requests
FOR EACH ROW EXECUTE FUNCTION public.concierge_route_reference_team();

-- Tighten assignment mutation without interfering with the main request-integrity
-- trigger or the patient-reply transition. This trigger runs after the router above.
CREATE OR REPLACE FUNCTION public.concierge_guard_clinician_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_role TEXT;
  expected_reference_doctor UUID;
BEGIN
  SELECT s.role INTO current_role
  FROM public.concierge_staff s
  WHERE s.user_id = auth.uid()
    AND s.active = true;

  -- Patient/system-mediated updates do not receive assignment privileges here.
  IF current_role IS NULL THEN
    IF NEW.assigned_nurse_id IS DISTINCT FROM OLD.assigned_nurse_id
       OR NEW.assigned_doctor_id IS DISTINCT FROM OLD.assigned_doctor_id THEN
      RAISE EXCEPTION 'Patient cannot change Concierge professional assignment';
    END IF;
    RETURN NEW;
  END IF;

  IF current_role IN ('admin','care_coordinator') THEN
    RETURN NEW;
  END IF;

  IF current_role = 'doctor'
     AND NEW.assigned_nurse_id IS DISTINCT FROM OLD.assigned_nurse_id THEN
    RAISE EXCEPTION 'Doctor cannot change nursing assignment';
  END IF;

  IF current_role = 'nurse'
     AND NEW.assigned_doctor_id IS DISTINCT FROM OLD.assigned_doctor_id THEN

    expected_reference_doctor := public.concierge_reference_professional_id(NEW.patient_id, 'doctor');

    IF NOT (
      NEW.status = 'escalated_medical'
      AND expected_reference_doctor IS NOT NULL
      AND NEW.assigned_doctor_id = expected_reference_doctor
    ) THEN
      RAISE EXCEPTION 'Nurse cannot assign an arbitrary physician';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_20_concierge_guard_clinician_assignment ON public.concierge_requests;
CREATE TRIGGER trg_20_concierge_guard_clinician_assignment
BEFORE UPDATE ON public.concierge_requests
FOR EACH ROW EXECUTE FUNCTION public.concierge_guard_clinician_assignment();

-- ---------------------------------------------------------------------------
-- FINAL REQUEST UPDATE POLICY
-- ---------------------------------------------------------------------------
-- Triggers remain defense-in-depth, but authorization must also fail closed in
-- RLS. This prevents a direct PostgREST PATCH from persisting an arbitrary
-- clinician even if a trigger is ever weakened, reordered or bypassed by a
-- future database/runtime change.
DROP POLICY IF EXISTS concierge_requests_staff_update ON public.concierge_requests;
CREATE POLICY concierge_requests_staff_update ON public.concierge_requests
  FOR UPDATE TO authenticated
  USING (public.concierge_can_access_request(id))
  WITH CHECK (
    public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[])
    OR
    (
      public.concierge_has_staff_role(ARRAY['nurse']::TEXT[])
      AND assigned_nurse_id = auth.uid()
      AND (
        public.concierge_reference_professional_id(patient_id, 'nurse') IS NULL
        OR public.concierge_reference_professional_id(patient_id, 'nurse') = auth.uid()
      )
      AND (
        assigned_doctor_id IS NULL
        OR (
          assigned_doctor_id = public.concierge_reference_professional_id(patient_id, 'doctor')
          AND status IN ('escalated_medical','medical_review','waiting_patient','action_plan','resolved')
        )
      )
    )
    OR
    (
      public.concierge_has_staff_role(ARRAY['doctor']::TEXT[])
      AND assigned_doctor_id = auth.uid()
      AND (
        public.concierge_reference_professional_id(patient_id, 'doctor') IS NULL
        OR public.concierge_reference_professional_id(patient_id, 'doctor') = auth.uid()
      )
      AND (
        public.concierge_reference_professional_id(patient_id, 'nurse') IS NULL
        OR assigned_nurse_id = public.concierge_reference_professional_id(patient_id, 'nurse')
      )
    )
  );

-- Read-only helper used by validation and operations diagnostics.
CREATE OR REPLACE FUNCTION public.concierge_reference_team(target_patient UUID)
RETURNS TABLE (
  assignment_role TEXT,
  professional_id UUID,
  professional_name TEXT,
  specialty TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.role,
    a.professional_id,
    COALESCE(a.professional_name, s.display_name),
    COALESCE(a.specialty, s.specialty)
  FROM public.concierge_assignments a
  JOIN public.concierge_staff s ON s.user_id = a.professional_id
  WHERE a.patient_id = target_patient
    AND a.status = 'active'
    AND a.is_primary = true
    AND s.active = true
    AND (
      target_patient = auth.uid()
      OR public.concierge_can_access_patient(target_patient)
      OR public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[])
    )
  ORDER BY CASE a.role WHEN 'nurse' THEN 1 WHEN 'care_coordinator' THEN 2 WHEN 'doctor' THEN 3 ELSE 4 END;
$$;

REVOKE ALL ON FUNCTION public.concierge_reference_team(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_reference_team(UUID) TO authenticated;
