-- =====================================================
-- CONCIERGE EXTERNAL PATIENT PROJECTION V1
-- HealthWallet patient visibility + secure patient choice
-- Run AFTER SQL_MYDATAMED_MASTER_EXTERNAL_COORDINATION_V1.sql
-- =====================================================

-- Patient projection uses SECURITY DEFINER RPCs so the patient never receives
-- direct SELECT access to operational task/option rows. Only safe fields are returned.

CREATE OR REPLACE FUNCTION public.concierge_patient_list_external_tasks()
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  patient_name TEXT,
  task_type TEXT,
  title TEXT,
  description TEXT,
  target_specialty TEXT,
  city TEXT,
  state TEXT,
  insurance_name TEXT,
  status TEXT,
  selected_option_id UUID,
  provider_name TEXT,
  provider_contact TEXT,
  provider_address TEXT,
  scheduled_at TIMESTAMPTZ,
  booking_reference TEXT,
  preparation_instructions TEXT,
  result_expected_at TIMESTAMPTZ,
  result_received_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    t.id,
    t.patient_id,
    t.patient_name,
    t.task_type,
    t.title,
    t.description,
    t.target_specialty,
    t.city,
    t.state,
    t.insurance_name,
    t.status,
    t.selected_option_id,
    t.provider_name,
    t.provider_contact,
    t.provider_address,
    t.scheduled_at,
    t.booking_reference,
    t.preparation_instructions,
    t.result_expected_at,
    t.result_received_at,
    t.closed_at,
    t.created_at,
    t.updated_at
  FROM public.concierge_external_tasks t
  WHERE t.patient_id = auth.uid()
  ORDER BY t.created_at DESC;
$$;

REVOKE ALL
ON FUNCTION public.concierge_patient_list_external_tasks()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.concierge_patient_list_external_tasks()
FROM anon;

GRANT EXECUTE
ON FUNCTION public.concierge_patient_list_external_tasks()
TO authenticated;


CREATE OR REPLACE FUNCTION public.concierge_patient_list_external_options(
  p_task_id UUID
)
RETURNS TABLE (
  id UUID,
  task_id UUID,
  provider_name TEXT,
  provider_type TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  phone TEXT,
  website TEXT,
  price_amount NUMERIC,
  currency TEXT,
  accepts_insurance BOOLEAN,
  insurance_notes TEXT,
  earliest_slot TIMESTAMPTZ,
  distance_text TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    o.id,
    o.task_id,
    o.provider_name,
    o.provider_type,
    o.address,
    o.city,
    o.state,
    o.phone,
    o.website,
    o.price_amount,
    o.currency,
    o.accepts_insurance,
    o.insurance_notes,
    o.earliest_slot,
    o.distance_text,
    o.status,
    o.created_at,
    o.updated_at
  FROM public.concierge_external_options o
  JOIN public.concierge_external_tasks t
    ON t.id = o.task_id
  WHERE o.task_id = p_task_id
    AND t.patient_id = auth.uid()
    AND o.status IN ('offered', 'selected')
  ORDER BY o.earliest_slot ASC NULLS LAST, o.created_at ASC;
$$;

REVOKE ALL
ON FUNCTION public.concierge_patient_list_external_options(UUID)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.concierge_patient_list_external_options(UUID)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.concierge_patient_list_external_options(UUID)
TO authenticated;


-- Patient choice is transactional. The patient never receives UPDATE permission
-- on tasks/options; this RPC validates ownership and allowed states.
CREATE OR REPLACE FUNCTION public.concierge_patient_select_external_option(
  p_task_id UUID,
  p_option_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  selected_task public.concierge_external_tasks%ROWTYPE;
  selected_option public.concierge_external_options%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT *
  INTO selected_task
  FROM public.concierge_external_tasks
  WHERE id = p_task_id
    AND patient_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coordination task not found';
  END IF;

  IF selected_task.status NOT IN (
    'options_ready',
    'awaiting_patient_choice',
    'selected'
  ) THEN
    RAISE EXCEPTION 'patient choice is not available for this task';
  END IF;

  SELECT *
  INTO selected_option
  FROM public.concierge_external_options
  WHERE id = p_option_id
    AND task_id = p_task_id
    AND status IN ('offered', 'selected')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'option is not available';
  END IF;

  UPDATE public.concierge_external_options
  SET
    status = CASE
      WHEN id = p_option_id THEN 'selected'
      WHEN status = 'offered' THEN 'rejected'
      ELSE status
    END,
    updated_at = NOW()
  WHERE task_id = p_task_id
    AND (id = p_option_id OR status = 'offered');

  UPDATE public.concierge_external_tasks
  SET
    selected_option_id = selected_option.id,
    provider_name = selected_option.provider_name,
    provider_contact = COALESCE(selected_option.phone, selected_option.website),
    provider_address = selected_option.address,
    status = 'selected',
    updated_at = NOW()
  WHERE id = p_task_id;

  INSERT INTO public.concierge_external_events (
    task_id,
    patient_id,
    actor_user_id,
    actor_role,
    event_type,
    visibility,
    message,
    payload
  )
  VALUES (
    p_task_id,
    current_user_id,
    current_user_id,
    'patient',
    'patient_selected_provider',
    'patient',
    'Você escolheu uma opção. O Concierge seguirá com o agendamento.',
    jsonb_build_object(
      'option_id', selected_option.id,
      'provider_name', selected_option.provider_name
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'task_id', p_task_id,
    'option_id', selected_option.id,
    'provider_name', selected_option.provider_name,
    'status', 'selected'
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.concierge_patient_select_external_option(UUID, UUID)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.concierge_patient_select_external_option(UUID, UUID)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.concierge_patient_select_external_option(UUID, UUID)
TO authenticated;

COMMENT ON FUNCTION public.concierge_patient_select_external_option(UUID, UUID)
IS 'Allows an authenticated patient to select only an offered provider option from their own external Concierge coordination task.';
