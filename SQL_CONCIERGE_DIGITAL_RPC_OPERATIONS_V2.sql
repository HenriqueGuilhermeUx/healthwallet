-- Concierge Digital RPC Operations V2
-- Adds operational-case creation to the direct Supabase RPC transport.
-- Keeps Concierge activation independent from DocWallet/legal authorization.
-- Authorization is case-scoped and only gates formal representation actions.

BEGIN;

CREATE OR REPLACE FUNCTION public.concierge_send_message_v1(
  p_session_id UUID DEFAULT NULL,
  p_message TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'text',
  p_subject_family_member_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_membership_status TEXT;
  v_membership_plan TEXT;
  v_consent_status TEXT;
  v_entitlement_status TEXT;
  v_entitlement_plan TEXT;
  v_entitlement_allowed BOOLEAN := FALSE;
  v_source TEXT;
  v_channel TEXT;
  v_session_id UUID;
  v_reply TEXT;
  v_intent TEXT := 'conversation';
  v_attention BOOLEAN := FALSE;
  v_requires_representation BOOLEAN := FALSE;
  v_case_type TEXT := NULL;
  v_request_id UUID := NULL;
  v_case_id UUID := NULL;
  v_warning TEXT := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  p_message := btrim(COALESCE(p_message, ''));
  IF p_message = '' THEN
    RAISE EXCEPTION 'message required' USING ERRCODE = '22023';
  END IF;

  IF char_length(p_message) > 5000 THEN
    p_message := left(p_message, 5000);
  END IF;

  v_source := CASE
    WHEN p_source IN ('text','voice') THEN p_source
    ELSE 'text'
  END;

  v_channel := CASE
    WHEN v_source = 'voice' THEN 'voice'
    ELSE 'text'
  END;

  SELECT m.status, m.plan_code, m.consent_status
  INTO v_membership_status, v_membership_plan, v_consent_status
  FROM public.concierge_memberships m
  WHERE m.patient_id = v_uid
  LIMIT 1;

  SELECT e.status, e.plan_code
  INTO v_entitlement_status, v_entitlement_plan
  FROM public.concierge_entitlements e
  WHERE e.patient_id = v_uid
  LIMIT 1;

  v_entitlement_allowed :=
    CASE
      WHEN v_entitlement_status IS NOT NULL
        THEN v_entitlement_status IN ('trial','active','grace')
      ELSE v_membership_status IN ('pilot','active')
    END;

  IF v_membership_status IS NULL
     OR NOT v_entitlement_allowed
     OR v_consent_status IS DISTINCT FROM 'accepted'
     OR COALESCE(v_membership_plan, v_entitlement_plan, '') NOT LIKE 'concierge%' THEN
    RAISE EXCEPTION 'concierge subscription required' USING ERRCODE = '42501';
  END IF;

  IF p_subject_family_member_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.family_members f
      WHERE f.id = p_subject_family_member_id
        AND f.user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'invalid family member' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_session_id IS NOT NULL THEN
    SELECT s.id
    INTO v_session_id
    FROM public.concierge_chat_sessions s
    WHERE s.id = p_session_id
      AND s.patient_id = v_uid
      AND s.status <> 'closed'
    LIMIT 1;
  END IF;

  IF v_session_id IS NULL THEN
    INSERT INTO public.concierge_chat_sessions (
      patient_id,
      status,
      channel,
      metadata
    )
    VALUES (
      v_uid,
      'ai_active',
      v_channel,
      jsonb_strip_nulls(
        jsonb_build_object(
          'product', 'concierge_digital',
          'engine', 'rpc_v2',
          'subject_family_member_id', p_subject_family_member_id
        )
      )
    )
    RETURNING id INTO v_session_id;
  END IF;

  INSERT INTO public.concierge_chat_messages (
    session_id,
    patient_id,
    actor_user_id,
    actor_role,
    source,
    visibility,
    content,
    metadata
  )
  VALUES (
    v_session_id,
    v_uid,
    v_uid,
    'patient',
    v_source,
    'patient',
    p_message,
    jsonb_build_object('engine', 'rpc_v2')
  );

  IF p_message ~* '(negou|negada|negado|autoriza[cç][aã]o|glosa)' THEN
    v_intent := 'insurance_authorization';
    v_case_type := 'insurance_authorization';
    v_attention := TRUE;
    v_requires_representation := TRUE;
    v_reply :=
      'Entendi. Registrei a negativa do plano e abri um caso para acompanharmos documentos, protocolo e próximos passos. '
      || 'Se for necessário falar formalmente em seu nome, pediremos a autorização específica dentro desse caso.';

  ELSIF p_message ~* 'reembolso' THEN
    v_intent := 'reimbursement';
    v_case_type := 'reimbursement';
    v_attention := TRUE;
    v_requires_representation := TRUE;
    v_reply :=
      'Entendi. Registrei a demanda de reembolso e abri um caso para acompanharmos documentos, protocolo e próximos passos.';

  ELSIF p_message ~* '(falar com (uma )?pessoa|atendimento humano|concierge humano|enfermeir[ao])' THEN
    v_intent := 'human_handoff';
    v_attention := TRUE;
    v_reply := 'Certo. Registrei seu pedido para falar com a equipe Concierge.';

    UPDATE public.concierge_chat_sessions
    SET status = 'human_requested',
        human_requested_at = COALESCE(human_requested_at, NOW()),
        last_activity_at = NOW()
    WHERE id = v_session_id;

  ELSE
    v_reply :=
      'Recebi sua mensagem. O Concierge está acompanhando você e pode organizar os próximos passos.';
  END IF;

  IF v_case_type IS NOT NULL THEN
    -- Reuse an open case from the same chat/session + operational type.
    SELECT c.id, c.request_id
    INTO v_case_id, v_request_id
    FROM public.concierge_operational_cases c
    WHERE c.patient_id = v_uid
      AND c.chat_session_id = v_session_id
      AND c.case_type = v_case_type
      AND c.status NOT IN ('resolved','closed','cancelled')
    ORDER BY c.created_at DESC
    LIMIT 1;

    IF v_case_id IS NULL THEN
      BEGIN
        INSERT INTO public.concierge_requests (
          patient_id,
          category,
          title,
          description,
          subject_family_member_id,
          symptom_payload,
          context_snapshot,
          urgency,
          status,
          metadata
        )
        VALUES (
          v_uid,
          'navigation',
          CASE
            WHEN v_case_type = 'reimbursement'
              THEN 'Reembolso do plano de saúde'
            ELSE 'Negativa ou autorização do plano de saúde'
          END,
          p_message,
          p_subject_family_member_id,
          '{}'::jsonb,
          '{}'::jsonb,
          'routine',
          'new',
          jsonb_build_object(
            'source_app', 'healthwallet',
            'product', 'health_concierge',
            'source', 'concierge_digital_rpc_v2',
            'chat_session_id', v_session_id,
            'operational_type', v_case_type
          )
        )
        RETURNING id INTO v_request_id;

        INSERT INTO public.concierge_request_events (
          request_id,
          patient_id,
          actor_user_id,
          actor_role,
          event_type,
          visibility,
          message,
          payload
        )
        VALUES (
          v_request_id,
          v_uid,
          v_uid,
          'patient',
          'request_created',
          'patient',
          'Solicitação criada pelo Concierge Digital.',
          jsonb_build_object(
            'source', 'concierge_digital_rpc_v2',
            'chat_session_id', v_session_id,
            'operational_type', v_case_type
          )
        );

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
          v_uid,
          p_subject_family_member_id,
          v_request_id,
          v_session_id,
          v_case_type,
          CASE
            WHEN v_case_type = 'reimbursement'
              THEN 'Reembolso do plano de saúde'
            ELSE 'Negativa ou autorização do plano de saúde'
          END,
          p_message,
          'normal',
          CASE WHEN v_requires_representation THEN 'collecting_docs' ELSE 'new' END,
          jsonb_build_object(
            'source', 'concierge_digital_rpc_v2',
            'representation_required', v_requires_representation,
            'representation_ready', FALSE,
            'authorization_scope', CASE
              WHEN v_requires_representation
                THEN 'case_specific_only'
              ELSE NULL
            END
          )
        )
        RETURNING id INTO v_case_id;

        INSERT INTO public.concierge_case_events (
          case_id,
          patient_id,
          actor_user_id,
          actor_role,
          event_type,
          visibility,
          message,
          payload
        )
        VALUES (
          v_case_id,
          v_uid,
          v_uid,
          'patient',
          'case_created',
          'patient',
          CASE
            WHEN v_requires_representation
              THEN 'Caso aberto. O Concierge pode organizar documentos e próximos passos. Autorização formal será solicitada somente se este caso exigir representação em seu nome.'
            ELSE 'Caso operacional aberto pelo Concierge.'
          END,
          jsonb_build_object(
            'source', 'concierge_digital_rpc_v2',
            'representation_required', v_requires_representation,
            'representation_ready', FALSE
          )
        );
      EXCEPTION WHEN OTHERS THEN
        v_warning := 'operational_case_create_failed';
        v_case_id := NULL;
      END;
    END IF;
  END IF;

  IF v_intent <> 'human_handoff' THEN
    UPDATE public.concierge_chat_sessions
    SET status = CASE WHEN v_attention THEN 'attention' ELSE 'ai_active' END,
        attention_reason = CASE
          WHEN v_attention THEN 'Demanda operacional detectada no Concierge Digital.'
          ELSE NULL
        END,
        last_activity_at = NOW(),
        metadata = metadata
          || jsonb_strip_nulls(
               jsonb_build_object(
                 'engine', 'rpc_v2',
                 'last_intent', v_intent,
                 'subject_family_member_id', p_subject_family_member_id,
                 'operational_case_id', v_case_id
               )
             )
    WHERE id = v_session_id;
  END IF;

  INSERT INTO public.concierge_chat_messages (
    session_id,
    patient_id,
    actor_role,
    source,
    visibility,
    content,
    metadata
  )
  VALUES (
    v_session_id,
    v_uid,
    'ai',
    'system',
    'patient',
    v_reply,
    jsonb_strip_nulls(
      jsonb_build_object(
        'engine', 'rpc_v2',
        'mode', 'deterministic',
        'intent', v_intent,
        'request_id', v_request_id,
        'operational_case_id', v_case_id,
        'warning', v_warning
      )
    )
  );

  RETURN jsonb_strip_nulls(
    jsonb_build_object(
      'ok', TRUE,
      'sessionId', v_session_id,
      'status', CASE
        WHEN v_intent = 'human_handoff' THEN 'human_requested'
        WHEN v_attention THEN 'attention'
        ELSE 'ai_active'
      END,
      'reply', v_reply,
      'needsHuman', v_intent = 'human_handoff',
      'attentionLevel', CASE WHEN v_attention THEN 'watch' ELSE 'none' END,
      'aiMode', 'rpc_v2_deterministic',
      'createdRequestId', v_request_id,
      'createdOperationalCaseId', v_case_id,
      'warning', v_warning
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.concierge_send_message_v1(UUID, TEXT, TEXT, UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.concierge_send_message_v1(UUID, TEXT, TEXT, UUID)
TO authenticated;

-- Backfill requests created by rpc_v1 that do not yet have an operational case.
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
  NULLIF(r.metadata->>'chat_session_id','')::uuid,
  COALESCE(NULLIF(r.metadata->>'operational_type',''), 'general_navigation'),
  r.title,
  r.description,
  CASE WHEN r.urgency = 'priority' THEN 'high'
       WHEN r.urgency = 'urgent_redirect' THEN 'urgent'
       ELSE 'normal'
  END,
  CASE
    WHEN COALESCE(r.metadata->>'operational_type','') IN ('insurance_authorization','claim_denial','reimbursement')
      THEN 'collecting_docs'
    ELSE 'new'
  END,
  jsonb_build_object(
    'source', 'concierge_rpc_v2_backfill',
    'representation_required',
      COALESCE(r.metadata->>'operational_type','') IN ('insurance_authorization','claim_denial','reimbursement'),
    'representation_ready', FALSE,
    'authorization_scope', 'case_specific_only'
  )
FROM public.concierge_requests r
WHERE r.metadata->>'source' = 'concierge_digital_rpc_v1'
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
  'Caso operacional criado a partir da solicitação do Concierge Digital. Autorizações formais, quando necessárias, serão solicitadas somente para este caso.',
  jsonb_build_object(
    'source', 'concierge_rpc_v2_backfill',
    'representation_required', COALESCE((c.metadata->>'representation_required')::boolean, FALSE)
  )
FROM public.concierge_operational_cases c
WHERE c.metadata->>'source' = 'concierge_rpc_v2_backfill'
  AND NOT EXISTS (
    SELECT 1
    FROM public.concierge_case_events e
    WHERE e.case_id = c.id
      AND e.event_type = 'case_created'
  );

COMMIT;

-- Read-only validation
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
LEFT JOIN public.concierge_operational_cases c ON c.request_id = r.id
WHERE r.patient_id = '5ed8a3c8-9732-4cc3-97fd-4a234d772135'::uuid
ORDER BY r.created_at DESC
LIMIT 5;
