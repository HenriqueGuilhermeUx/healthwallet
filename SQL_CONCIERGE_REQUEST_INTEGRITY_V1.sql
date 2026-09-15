-- HEALTH CONCIERGE - REQUEST INTEGRITY V1
-- Validation environment only. Run after routing/consent migrations.

CREATE OR REPLACE FUNCTION public.concierge_guard_request_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_role TEXT;
BEGIN
  SELECT s.role INTO current_role
  FROM public.concierge_staff s
  WHERE s.user_id = auth.uid() AND s.active = true;

  IF current_role IS NULL THEN
    RAISE EXCEPTION 'Active Concierge staff role required';
  END IF;

  -- Patient-authored intake/context is immutable after creation.
  IF NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.subject_name IS DISTINCT FROM OLD.subject_name
     OR NEW.subject_relationship IS DISTINCT FROM OLD.subject_relationship
     OR NEW.subject_family_member_id IS DISTINCT FROM OLD.subject_family_member_id
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.symptom_payload IS DISTINCT FROM OLD.symptom_payload
     OR NEW.attachments IS DISTINCT FROM OLD.attachments
     OR NEW.context_snapshot IS DISTINCT FROM OLD.context_snapshot
     OR NEW.urgency IS DISTINCT FROM OLD.urgency
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Patient-authored request content is immutable';
  END IF;

  -- Nurses can take an unassigned case themselves, but cannot assign other nurses.
  IF current_role = 'nurse'
     AND NEW.assigned_nurse_id IS DISTINCT FROM OLD.assigned_nurse_id
     AND NEW.assigned_nurse_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Nurse cannot assign request to another nurse';
  END IF;

  -- A doctor can take an eligible medical case themselves, not assign another doctor.
  IF current_role = 'doctor'
     AND NEW.assigned_doctor_id IS DISTINCT FROM OLD.assigned_doctor_id
     AND NEW.assigned_doctor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Doctor cannot assign request to another doctor';
  END IF;

  IF current_role = 'nurse'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('in_triage','waiting_patient','waiting_nurse','escalated_medical','action_plan','resolved') THEN
    RAISE EXCEPTION 'Status transition not allowed for nurse';
  END IF;

  IF current_role = 'doctor'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('medical_review','waiting_patient','action_plan','resolved') THEN
    RAISE EXCEPTION 'Status transition not allowed for doctor';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concierge_guard_request_update ON public.concierge_requests;
CREATE TRIGGER trg_concierge_guard_request_update
BEFORE UPDATE ON public.concierge_requests
FOR EACH ROW EXECUTE FUNCTION public.concierge_guard_request_update();
