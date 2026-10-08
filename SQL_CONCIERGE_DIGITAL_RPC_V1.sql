-- Concierge Digital RPC transport V1
-- Replaces the unstable Netlify-function transport for patient chat send.
-- Authenticated users only. No anon/PUBLIC execute.

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
  v_request_id UUID := NULL;
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
          'engine', 'rpc_v1',
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
    jsonb_build_object('engine', 'rpc_v1')
  );

  IF p_message ~* '(negou|negada|negado|autoriza[cç][aã]o|glosa)' THEN
    v_intent := 'insurance_authorization';
    v_attention := TRUE;
    v_reply :=
      'Entendi. Registrei a negativa do plano e vou organizar os próximos passos. '
      || 'Se esse caso exigir contato formal em seu nome, a autorização específica será pedida somente dentro dele.';

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
        'Negativa ou autorização do plano de saúde',
        p_message,
        p_subject_family_member_id,
        '{}'::jsonb,
        '{}'::jsonb,
        'routine',
        'new',
        jsonb_build_object(
          'source_app', 'healthwallet',
          'product', 'health_concierge',
          'source', 'concierge_digital_rpc_v1',
          'chat_session_id', v_session_id,
          'operational_type', 'insurance_authorization'
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
          'source', 'concierge_digital_rpc_v1',
          'chat_session_id', v_session_id
        )
      );
    EXCEPTION WHEN OTHERS THEN
      v_warning := 'request_create_failed';
      v_request_id := NULL;
    END;

  ELSIF p_message ~* 'reembolso' THEN
    v_intent := 'reimbursement';
    v_attention := TRUE;
    v_reply :=
      'Entendi. Registrei a demanda de reembolso e vou organizar documentos, protocolo e próximos passos.';

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
        'Reembolso do plano de saúde',
        p_message,
        p_subject_family_member_id,
        '{}'::jsonb,
        '{}'::jsonb,
        'routine',
        'new',
        jsonb_build_object(
          'source_app', 'healthwallet',
          'product', 'health_concierge',
          'source', 'concierge_digital_rpc_v1',
          'chat_session_id', v_session_id,
          'operational_type', 'reimbursement'
        )
      )
      RETURNING id INTO v_request_id;
    EXCEPTION WHEN OTHERS THEN
      v_warning := 'request_create_failed';
      v_request_id := NULL;
    END;

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
      'Recebi sua mensagem. O Concierge está funcionando pelo novo motor seguro e posso organizar os próximos passos.';
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
                 'engine', 'rpc_v1',
                 'last_intent', v_intent,
                 'subject_family_member_id', p_subject_family_member_id
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
        'engine', 'rpc_v1',
        'mode', 'deterministic',
        'intent', v_intent,
        'request_id', v_request_id,
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
      'aiMode', 'rpc_v1_deterministic',
      'createdRequestId', v_request_id,
      'warning', v_warning
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.concierge_send_message_v1(UUID, TEXT, TEXT, UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.concierge_send_message_v1(UUID, TEXT, TEXT, UUID)
TO authenticated;

-- Post-check: should show authenticated=true and anon/public=false.
SELECT
  p.oid::regprocedure::text AS function_name,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'concierge_send_message_v1';
