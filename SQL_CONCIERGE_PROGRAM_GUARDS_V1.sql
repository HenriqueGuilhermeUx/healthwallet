-- HEALTH CONCIERGE - PROGRAM ENROLLMENT GUARDS V1
-- Validation environment only. Run after explicit consent.

ALTER TABLE public.concierge_programs
  ADD COLUMN IF NOT EXISTS enrollment_mode TEXT NOT NULL DEFAULT 'self';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'concierge_programs_enrollment_mode_check'
  ) THEN
    ALTER TABLE public.concierge_programs
      ADD CONSTRAINT concierge_programs_enrollment_mode_check
      CHECK (enrollment_mode IN ('self','team'));
  END IF;
END $$;

-- Condition-specific clinical programs start through the care team.
UPDATE public.concierge_programs
SET enrollment_mode = CASE
  WHEN slug IN ('hypertension','diabetes','pregnancy') THEN 'team'
  ELSE 'self'
END,
updated_at = NOW();

DROP POLICY IF EXISTS concierge_enrollments_patient_insert ON public.concierge_program_enrollments;
CREATE POLICY concierge_enrollments_patient_insert ON public.concierge_program_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    patient_id = auth.uid()
    AND public.concierge_has_active_consent(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.concierge_programs p
      WHERE p.id = program_id
        AND p.active = true
        AND p.enrollment_mode = 'self'
    )
  );

DROP POLICY IF EXISTS concierge_enrollments_staff_manage ON public.concierge_program_enrollments;
CREATE POLICY concierge_enrollments_staff_manage ON public.concierge_program_enrollments
  FOR ALL TO authenticated
  USING (public.concierge_can_access_patient(patient_id))
  WITH CHECK (public.concierge_can_access_patient(patient_id));

CREATE OR REPLACE FUNCTION public.concierge_guard_patient_program_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.patient_id AND NOT public.concierge_is_staff() THEN
    IF NEW.patient_id IS DISTINCT FROM OLD.patient_id
       OR NEW.program_id IS DISTINCT FROM OLD.program_id
       OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.metadata IS DISTINCT FROM OLD.metadata THEN
      RAISE EXCEPTION 'Patient cannot rewrite program assignment metadata';
    END IF;

    IF NEW.status NOT IN ('active','paused','completed','cancelled') THEN
      RAISE EXCEPTION 'Invalid patient program status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concierge_guard_patient_program_update ON public.concierge_program_enrollments;
CREATE TRIGGER trg_concierge_guard_patient_program_update
BEFORE UPDATE ON public.concierge_program_enrollments
FOR EACH ROW EXECUTE FUNCTION public.concierge_guard_patient_program_update();
