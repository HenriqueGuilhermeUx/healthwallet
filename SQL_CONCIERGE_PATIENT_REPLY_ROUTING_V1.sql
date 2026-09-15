-- =====================================================
-- HEALTH CONCIERGE - PATIENT REPLY ROUTING V1
-- Validation environment only.
-- Run after request-integrity and consent migrations.
-- Makes a patient's reply atomically return a waiting case to the correct lane.
-- =====================================================

-- The regular request-integrity guard rejects all patient-authored UPDATEs.
-- Keep that invariant, but allow the single system-mediated transition performed
-- by concierge_patient_reply(): waiting_patient -> waiting_nurse/medical_review.
CREATE OR REPLACE FUNCTION public.concierge_guard_request_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_role TEXT;
  patient_reply_transition BOOLEAN := false;
BEGIN
  SELECT s.role INTO current_role
  FROM public.concierge_staff s
  WHERE s.user_id = auth.uid() AND s.active = true;

  IF current_role IS NULL THEN
    patient_reply_transition :=
      auth.uid() = OLD.patient_id
      AND OLD.status = 'waiting_patient'
      AND (
        (OLD.assigned_doctor_id IS NOT NULL AND NEW.status = 'medical_review')
        OR
        (OLD.assigned_doctor_id IS NULL AND NEW.status = 'waiting_nurse')
      )
      AND (to_jsonb(NEW) - ARRAY['status','updated_at'])
          IS NOT DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['status','updated_at']);

    IF patient_reply_transition THEN
      RETURN NEW;
    END IF;

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

  IF current_role = 'nurse'
     AND NEW.assigned_nurse_id IS DISTINCT FROM OLD.assigned_nurse_id
     AND NEW.assigned_nurse_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Nurse cannot assign request to another nurse';
  END IF;

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

CREATE OR REPLACE FUNCTION public.concierge_patient_reply(
  target_request UUID,
  body TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.concierge_requests;
  event_id UUID;
  next_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF body IS NULL OR length(trim(body)) < 1 OR length(body) > 5000 THEN
    RAISE EXCEPTION 'Invalid message';
  END IF;

  SELECT * INTO req
  FROM public.concierge_requests
  WHERE id = target_request
    AND patient_id = auth.uid();

  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Concierge request not found';
  END IF;

  IF req.status IN ('resolved','closed') THEN
    RAISE EXCEPTION 'Closed Concierge request cannot receive a reply';
  END IF;

  IF NOT public.concierge_has_active_consent(auth.uid()) THEN
    RAISE EXCEPTION 'Active Concierge consent required';
  END IF;

  INSERT INTO public.concierge_request_events (
    request_id,
    patient_id,
    actor_user_id,
    actor_role,
    event_type,
    visibility,
    message,
    payload
  ) VALUES (
    req.id,
    req.patient_id,
    auth.uid(),
    'patient',
    'patient_message',
    'patient',
    trim(body),
    '{}'::jsonb
  )
  RETURNING id INTO event_id;

  IF req.status = 'waiting_patient' THEN
    next_status := CASE
      WHEN req.assigned_doctor_id IS NOT NULL THEN 'medical_review'
      ELSE 'waiting_nurse'
    END;

    UPDATE public.concierge_requests
    SET status = next_status,
        updated_at = NOW()
    WHERE id = req.id;
  ELSE
    next_status := req.status;
  END IF;

  -- Keep automation payload free of the patient's raw message. Automation is
  -- best-effort and must never prevent the patient reply itself from succeeding.
  IF to_regclass('public.automation_events') IS NOT NULL THEN
    BEGIN
      INSERT INTO public.automation_events (
        event_type,
        source_app,
        source_table,
        source_id,
        actor_user_id,
        actor_role,
        patient_id,
        payload,
        metadata,
        priority,
        status
      ) VALUES (
        'concierge_patient_message',
        'healthwallet',
        'concierge_requests',
        req.id,
        auth.uid(),
        'patient',
        req.patient_id,
        jsonb_build_object('request_id', req.id),
        jsonb_build_object(
          'product', 'health_concierge',
          'n8n_ready', true,
          'fetch_sensitive_context_by_id', true
        ),
        3,
        'pending'
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'event_id', event_id,
    'request_id', req.id,
    'status', next_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.concierge_patient_reply(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_patient_reply(UUID, TEXT) TO authenticated;
