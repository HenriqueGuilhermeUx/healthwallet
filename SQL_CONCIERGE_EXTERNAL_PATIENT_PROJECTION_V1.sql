-- =====================================================
-- CONCIERGE EXTERNAL PATIENT PROJECTION V1
-- HealthWallet patient visibility + secure patient choice
-- Run AFTER SQL_MYDATAMED_MASTER_EXTERNAL_COORDINATION_V1.sql
-- =====================================================

-- Patient can read only their own coordination tasks.
DROP POLICY IF EXISTS external_tasks_patient_read ON public.concierge_external_tasks;
CREATE POLICY external_tasks_patient_read
ON public.concierge_external_tasks
FOR SELECT
TO authenticated
USING (
  patient_id = (SELECT auth.uid())
);

-- Patient can see only provider options explicitly offered by the Concierge
-- or the option already selected for that task.
DROP POLICY IF EXISTS external_options_patient_read ON public.concierge_external_options;
CREATE POLICY external_options_patient_read
ON public.concierge_external_options
FOR SELECT
TO authenticated
USING (
  status IN ('offered', 'selected')
  AND EXISTS (
    SELECT 1
    FROM public.concierge_external_tasks t
    WHERE t.id = task_id
      AND t.patient_id = (SELECT auth.uid())
  )
);

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
