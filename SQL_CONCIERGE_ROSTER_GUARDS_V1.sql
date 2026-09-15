-- HEALTH CONCIERGE - ROSTER / TEAM ASSIGNMENT GUARDS V1
-- Validation environment only. Run after access guards and consent migration.

-- Coordinators need the active staff directory to distribute the pilot portfolio.
DROP POLICY IF EXISTS concierge_staff_coord_read ON public.concierge_staff;
CREATE POLICY concierge_staff_coord_read ON public.concierge_staff
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[])
  );

-- One transactional function replaces the primary professional for a role.
CREATE OR REPLACE FUNCTION public.concierge_set_primary_assignment(
  target_patient UUID,
  target_professional UUID,
  target_role TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assignment_id UUID;
  professional_name TEXT;
  professional_specialty TEXT;
  staff_role TEXT;
BEGIN
  IF NOT public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[]) THEN
    RAISE EXCEPTION 'Concierge coordinator role required';
  END IF;

  IF target_role NOT IN ('nurse','doctor','care_coordinator') THEN
    RAISE EXCEPTION 'Invalid assignment role';
  END IF;

  SELECT s.display_name, s.specialty, s.role
    INTO professional_name, professional_specialty, staff_role
  FROM public.concierge_staff s
  WHERE s.user_id = target_professional
    AND s.active = true;

  IF staff_role IS NULL THEN
    RAISE EXCEPTION 'Active Concierge professional not found';
  END IF;

  IF target_role = 'doctor' AND staff_role <> 'doctor' THEN
    RAISE EXCEPTION 'Selected professional is not a Concierge doctor';
  END IF;

  IF target_role IN ('nurse','care_coordinator') AND staff_role NOT IN ('nurse','care_coordinator') THEN
    RAISE EXCEPTION 'Selected professional is not nursing/care coordination staff';
  END IF;

  -- End previous primary assignment of the same care layer.
  UPDATE public.concierge_assignments
  SET status = 'ended',
      is_primary = false,
      ended_at = NOW(),
      updated_at = NOW()
  WHERE patient_id = target_patient
    AND status = 'active'
    AND is_primary = true
    AND (
      (target_role = 'doctor' AND role = 'doctor')
      OR (target_role IN ('nurse','care_coordinator') AND role IN ('nurse','care_coordinator'))
    )
    AND professional_id <> target_professional;

  INSERT INTO public.concierge_assignments (
    patient_id,
    professional_id,
    role,
    is_primary,
    status,
    professional_name,
    specialty,
    metadata
  ) VALUES (
    target_patient,
    target_professional,
    target_role,
    true,
    'active',
    professional_name,
    professional_specialty,
    jsonb_build_object('assigned_by', auth.uid(), 'source', 'concierge_roster')
  )
  ON CONFLICT (patient_id, professional_id, role)
  DO UPDATE SET
    is_primary = true,
    status = 'active',
    professional_name = EXCLUDED.professional_name,
    specialty = EXCLUDED.specialty,
    ended_at = NULL,
    updated_at = NOW(),
    metadata = EXCLUDED.metadata
  RETURNING id INTO assignment_id;

  RETURN assignment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.concierge_set_primary_assignment(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_set_primary_assignment(UUID, UUID, TEXT) TO authenticated;
