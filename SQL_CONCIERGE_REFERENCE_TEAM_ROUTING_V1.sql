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
    SELECT a.professional_id
      INTO reference_nurse
    FROM public.concierge_assignments a
    JOIN public.concierge_staff s ON s.user_id = a.professional_id
    WHERE a.patient_id = NEW.patient_id
      AND a.status = 'active'
      AND a.is_primary = true
      AND a.role IN ('nurse','care_coordinator')
      AND s.active = true
    ORDER BY CASE a.role WHEN 'nurse' THEN 0 ELSE 1 END, a.started_at ASC
    LIMIT 1;

    NEW.assigned_nurse_id := reference_nurse;
  END IF;

  -- When a nurse escalates, prefer the patient's reference physician.
  IF TG_OP = 'UPDATE'
     AND NEW.assigned_doctor_id IS NULL
     AND NEW.status IN ('escalated_medical','medical_review')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT a.professional_id
      INTO reference_doctor
    FROM public.concierge_assignments a
    JOIN public.concierge_staff s ON s.user_id = a.professional_id
    WHERE a.patient_id = NEW.patient_id
      AND a.status = 'active'
      AND a.is_primary = true
      AND a.role = 'doctor'
      AND s.active = true
    ORDER BY a.started_at ASC
    LIMIT 1;

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

    SELECT a.professional_id
      INTO expected_reference_doctor
    FROM public.concierge_assignments a
    JOIN public.concierge_staff s ON s.user_id = a.professional_id
    WHERE a.patient_id = NEW.patient_id
      AND a.status = 'active'
      AND a.is_primary = true
      AND a.role = 'doctor'
      AND s.active = true
    ORDER BY a.started_at ASC
    LIMIT 1;

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
