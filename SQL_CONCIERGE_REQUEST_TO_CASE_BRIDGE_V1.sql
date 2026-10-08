-- Concierge Request -> Operational Case Bridge V1
-- Idempotent database bridge for requests created by Concierge Digital.
-- Does not make DocWallet/legal authorization a global activation gate.

BEGIN;

CREATE OR REPLACE FUNCTION private.concierge_bridge_request_to_case()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source TEXT := COALESCE(NEW.metadata->>'source', '');
  v_operational_type TEXT := COALESCE(NULLIF(NEW.metadata->>'operational_type',''), 'general_navigation');
  v_chat_session_id UUID := NULL;
  v_case_type TEXT;
  v_case_status TEXT;
  v_requires_representation BOOLEAN := FALSE;
  v_case_id UUID;
BEGIN
  IF v_source NOT IN (
    'concierge_digital_rpc_v1',
    'concierge_digital_rpc_v2'
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_chat_session_id := NULLIF(NEW.metadata->>'chat_session_id','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_chat_session_id := NULL;
  END;

  v_case_type := CASE
    WHEN v_operational_type IN (
      'provider_search',
      'scheduling',
      'insurance_authorization',
      'reimbursement',
      'claim_denial',
      'hospitalization',
      'surgery',
      'complex_case',
      'caregiver_coordination',
      'general_navigation',
      'other'
    ) THEN v_operational_type
    ELSE 'general_navigation'
  END;

  v_requires_representation := v_case_type IN (
    'insurance_authorization',
    'reimbursement',
    'claim_denial'
  );

  v_case_status := CASE
    WHEN v_requires_representation THEN 'collecting_docs'
    ELSE 'new'
  END;

  SELECT c.id
  INTO v_case_id
  FROM public.concierge_operational_cases c
  WHERE c.request_id = NEW.id
  LIMIT 1;

  IF v_case_id IS NULL THEN
    INSERT INTO public.concierge_operational_cases (
      patient_id,
      subject_family_member_id,
      request_id,
      chat_session_id,
      case_type,
      title,
      description,
      priority,
      status,
      metadata
    )
    VALUES (
      NEW.patient_id,
      NEW.subject_family_member_id,
      NEW.id,
      v_chat_session_id,
      v_case_type,
      NEW.title,
      NEW.description,
      CASE
        WHEN NEW.urgency = 'urgent_redirect' THEN 'urgent'
        WHEN NEW.urgency = 'priority' THEN 'high'
        ELSE 'normal'
      END,
      v_case_status,
      jsonb_build_object(
        'source', 'concierge_request_to_case_bridge_v1',
        'representation_required', v_requires_representation,
        'representation_ready', FALSE,
        'authorization_scope',
          CASE WHEN v_requires_representation
            THEN 'case_specific_only'
            ELSE 'not_required'
          END
      )
    )
    RETURNING id INTO v_case_id;

    INSERT INTO public.concierge_case_events (
      case_id,
      patient_id,
      actor_role,
      event_type,
      visibility,
      message,
      payload
    )
    VALUES (
      v_case_id,
      NEW.patient_id,
      'system',
      'case_created',
      'patient',
      CASE
        WHEN v_requires_representation THEN
          'Caso aberto. O Concierge pode organizar documentos e próximos passos. Se houver necessidade de representação formal, a autorização será solicitada somente para este caso.'
        ELSE
          'Caso operacional aberto pelo Concierge.'
      END,
      jsonb_build_object(
        'source', 'concierge_request_to_case_bridge_v1',
        'request_id', NEW.id,
        'representation_required', v_requires_representation,
        'representation_ready', FALSE
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.concierge_bridge_request_to_case()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_concierge_request_to_operational_case
ON public.concierge_requests;

CREATE TRIGGER trg_concierge_request_to_operational_case
AFTER INSERT ON public.concierge_requests
FOR EACH ROW
EXECUTE FUNCTION private.concierge_bridge_request_to_case();

-- Backfill existing Concierge Digital RPC requests that predate the trigger.
INSERT INTO public.concierge_operational_cases (
  patient_id,
  subject_family_member_id,
  request_id,
  chat_session_id,
  case_type,
  title,
  description,
  priority,
  status,
  metadata
)
SELECT
  r.patient_id,
  r.subject_family_member_id,
  r.id,
  CASE
    WHEN COALESCE(r.metadata->>'chat_session_id','') ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (r.metadata->>'chat_session_id')::uuid
    ELSE NULL
  END,
  CASE
    WHEN COALESCE(NULLIF(r.metadata->>'operational_type',''),'general_navigation') IN (
      'provider_search',
      'scheduling',
      'insurance_authorization',
      'reimbursement',
      'claim_denial',
      'hospitalization',
      'surgery',
      'complex_case',
      'caregiver_coordination',
      'general_navigation',
      'other'
    )
      THEN COALESCE(NULLIF(r.metadata->>'operational_type',''),'general_navigation')
    ELSE 'general_navigation'
  END,
  r.title,
  r.description,
  CASE
    WHEN r.urgency = 'urgent_redirect' THEN 'urgent'
    WHEN r.urgency = 'priority' THEN 'high'
    ELSE 'normal'
  END,
  CASE
    WHEN COALESCE(r.metadata->>'operational_type','') IN (
      'insurance_authorization',
      'reimbursement',
      'claim_denial'
    ) THEN 'collecting_docs'
    ELSE 'new'
  END,
  jsonb_build_object(
    'source', 'concierge_request_to_case_bridge_v1_backfill',
    'representation_required',
      COALESCE(r.metadata->>'operational_type','') IN (
        'insurance_authorization',
        'reimbursement',
        'claim_denial'
      ),
    'representation_ready', FALSE,
    'authorization_scope',
      CASE
        WHEN COALESCE(r.metadata->>'operational_type','') IN (
          'insurance_authorization',
          'reimbursement',
          'claim_denial'
        ) THEN 'case_specific_only'
        ELSE 'not_required'
      END
  )
FROM public.concierge_requests r
WHERE COALESCE(r.metadata->>'source','') IN (
  'concierge_digital_rpc_v1',
  'concierge_digital_rpc_v2'
)
AND NOT EXISTS (
  SELECT 1
  FROM public.concierge_operational_cases c
  WHERE c.request_id = r.id
);

INSERT INTO public.concierge_case_events (
  case_id,
  patient_id,
  actor_role,
  event_type,
  visibility,
  message,
  payload
)
SELECT
  c.id,
  c.patient_id,
  'system',
  'case_created',
  'patient',
  CASE
    WHEN COALESCE((c.metadata->>'representation_required')::boolean, FALSE) THEN
      'Caso aberto. O Concierge pode organizar documentos e próximos passos. Se houver necessidade de representação formal, a autorização será solicitada somente para este caso.'
    ELSE
      'Caso operacional aberto pelo Concierge.'
  END,
  jsonb_build_object(
    'source', 'concierge_request_to_case_bridge_v1_backfill',
    'request_id', c.request_id,
    'representation_required',
      COALESCE((c.metadata->>'representation_required')::boolean, FALSE),
    'representation_ready', FALSE
  )
FROM public.concierge_operational_cases c
WHERE c.metadata->>'source' = 'concierge_request_to_case_bridge_v1_backfill'
AND NOT EXISTS (
  SELECT 1
  FROM public.concierge_case_events e
  WHERE e.case_id = c.id
    AND e.event_type = 'case_created'
);

COMMIT;

-- Validation
SELECT
  r.id AS request_id,
  r.title AS request_title,
  c.id AS operational_case_id,
  c.case_type,
  c.status,
  c.metadata->>'representation_required' AS representation_required,
  c.metadata->>'representation_ready' AS representation_ready,
  c.metadata->>'authorization_scope' AS authorization_scope
FROM public.concierge_requests r
LEFT JOIN public.concierge_operational_cases c
  ON c.request_id = r.id
WHERE r.patient_id = '5ed8a3c8-9732-4cc3-97fd-4a234d772135'::uuid
ORDER BY r.created_at DESC
LIMIT 5;
