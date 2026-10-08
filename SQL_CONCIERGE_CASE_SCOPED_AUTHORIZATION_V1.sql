-- Concierge case-scoped representation authorization V1
-- Converts representation authorization from subscriber-wide semantics
-- to a case-scoped operational permission without changing Concierge activation.

BEGIN;

ALTER TABLE public.concierge_legal_authorizations
  ADD COLUMN IF NOT EXISTS case_id UUID
    REFERENCES public.concierge_operational_cases(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS purpose TEXT,
  ADD COLUMN IF NOT EXISTS recipient TEXT,
  ADD COLUMN IF NOT EXISTS authorization_scope JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.concierge_legal_authorizations
  DROP CONSTRAINT IF EXISTS concierge_legal_authorizations_patient_id_authorization_type_key;

CREATE INDEX IF NOT EXISTS idx_concierge_legal_case
  ON public.concierge_legal_authorizations(case_id, status, updated_at DESC)
  WHERE case_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_concierge_legal_subscriber_auth
  ON public.concierge_legal_authorizations(patient_id, authorization_type)
  WHERE case_id IS NULL
    AND authorization_type IN ('service_terms','privacy_consent','combined_onboarding');

CREATE UNIQUE INDEX IF NOT EXISTS uq_concierge_legal_case_auth
  ON public.concierge_legal_authorizations(patient_id, case_id, authorization_type)
  WHERE case_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.concierge_sync_case_representation_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_case_id UUID := COALESCE(NEW.case_id, OLD.case_id);
  v_patient_id UUID := COALESCE(NEW.patient_id, OLD.patient_id);
  v_ready BOOLEAN := FALSE;
  v_old_status TEXT := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END;
  v_new_status TEXT := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.status END;
BEGIN
  IF v_case_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.concierge_legal_authorizations a
    WHERE a.case_id = v_case_id
      AND a.patient_id = v_patient_id
      AND a.authorization_type = 'representation_authorization'
      AND a.status = 'signed'
  )
  INTO v_ready;

  UPDATE public.concierge_operational_cases c
  SET metadata = jsonb_set(
        COALESCE(c.metadata, '{}'::jsonb),
        '{representation_ready}',
        to_jsonb(v_ready),
        true
      ),
      updated_at = NOW()
  WHERE c.id = v_case_id
    AND c.patient_id = v_patient_id;

  IF TG_OP <> 'DELETE'
     AND NEW.authorization_type = 'representation_authorization'
     AND v_old_status IS DISTINCT FROM v_new_status THEN

    IF v_new_status = 'signed' THEN
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
        v_patient_id,
        'system',
        'representation_authorization_signed',
        'patient',
        'Autorização específica deste caso assinada. A equipe pode executar as ações formais previstas no escopo autorizado.',
        jsonb_build_object(
          'authorization_id', NEW.id,
          'scope', NEW.authorization_scope
        )
      );

    ELSIF v_new_status IN ('revoked','expired') THEN
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
        v_patient_id,
        'system',
        'representation_authorization_unavailable',
        'patient',
        'A autorização específica deste caso não está mais válida. Nenhuma nova ação formal será realizada em seu nome até nova autorização.',
        jsonb_build_object(
          'authorization_id', NEW.id,
          'status', NEW.status
        )
      );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION private.concierge_sync_case_representation_ready()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_concierge_case_representation_ready
ON public.concierge_legal_authorizations;

CREATE TRIGGER trg_concierge_case_representation_ready
AFTER INSERT OR UPDATE OF status, case_id OR DELETE
ON public.concierge_legal_authorizations
FOR EACH ROW
EXECUTE FUNCTION private.concierge_sync_case_representation_ready();

CREATE OR REPLACE FUNCTION public.concierge_prepare_case_authorization(
  p_case_id UUID,
  p_purpose TEXT DEFAULT NULL,
  p_recipient TEXT DEFAULT NULL,
  p_scope JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_case public.concierge_operational_cases%ROWTYPE;
  v_auth public.concierge_legal_authorizations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  IF NOT private.concierge_operations_is_staff(v_uid) THEN
    RAISE EXCEPTION 'Concierge staff access required' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_case
  FROM public.concierge_operational_cases
  WHERE id = p_case_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'operational case not found' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE((v_case.metadata->>'representation_required')::boolean, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'representation authorization is not required for this case'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_auth
  FROM public.concierge_legal_authorizations
  WHERE patient_id = v_case.patient_id
    AND case_id = v_case.id
    AND authorization_type = 'representation_authorization'
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.concierge_legal_authorizations (
      patient_id,
      case_id,
      authorization_type,
      status,
      purpose,
      recipient,
      authorization_scope,
      metadata
    )
    VALUES (
      v_case.patient_id,
      v_case.id,
      'representation_authorization',
      'pending',
      COALESCE(
        NULLIF(btrim(p_purpose), ''),
        'Representação administrativa limitada ao caso ' || v_case.title
      ),
      NULLIF(btrim(p_recipient), ''),
      COALESCE(p_scope, '{}'::jsonb),
      jsonb_build_object(
        'source', 'concierge_case_authorization_v1',
        'case_type', v_case.case_type,
        'created_by', v_uid
      )
    )
    RETURNING * INTO v_auth;
  ELSE
    UPDATE public.concierge_legal_authorizations
    SET purpose = COALESCE(NULLIF(btrim(p_purpose), ''), purpose),
        recipient = COALESCE(NULLIF(btrim(p_recipient), ''), recipient),
        authorization_scope = CASE
          WHEN COALESCE(p_scope, '{}'::jsonb) = '{}'::jsonb
            THEN authorization_scope
          ELSE p_scope
        END,
        updated_at = NOW()
    WHERE id = v_auth.id
    RETURNING * INTO v_auth;
  END IF;

  INSERT INTO public.concierge_case_documents (
    case_id,
    patient_id,
    document_type,
    label,
    status,
    metadata
  )
  VALUES (
    v_case.id,
    v_case.patient_id,
    'representation_authorization',
    'Autorização específica de representação',
    CASE
      WHEN v_auth.status = 'signed' THEN 'signed'
      WHEN v_auth.status = 'signature_pending' THEN 'signature_pending'
      ELSE 'pending'
    END,
    jsonb_build_object(
      'authorization_id', v_auth.id,
      'purpose', v_auth.purpose,
      'recipient', v_auth.recipient,
      'scope', v_auth.authorization_scope,
      'case_scoped', TRUE
    )
  )
  ON CONFLICT (case_id, document_type)
  WHERE document_type IN (
    'service_terms',
    'privacy_consent',
    'representation_authorization',
    'combined_onboarding'
  )
  DO UPDATE SET
    status = EXCLUDED.status,
    label = EXCLUDED.label,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

  IF NOT EXISTS (
    SELECT 1
    FROM public.concierge_case_events e
    WHERE e.case_id = v_case.id
      AND e.event_type = 'representation_authorization_requested'
      AND e.payload->>'authorization_id' = v_auth.id::text
  ) THEN
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
      v_case.id,
      v_case.patient_id,
      v_uid,
      'concierge',
      'representation_authorization_requested',
      'patient',
      'A equipe identificou que este caso precisa de uma autorização específica antes de agir formalmente em seu nome.',
      jsonb_build_object(
        'authorization_id', v_auth.id,
        'purpose', v_auth.purpose,
        'recipient', v_auth.recipient,
        'scope', v_auth.authorization_scope
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'case_id', v_case.id,
    'authorization_id', v_auth.id,
    'status', v_auth.status,
    'purpose', v_auth.purpose,
    'recipient', v_auth.recipient,
    'scope', v_auth.authorization_scope
  );
END;
$$;

REVOKE ALL ON FUNCTION public.concierge_prepare_case_authorization(UUID, TEXT, TEXT, JSONB)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.concierge_prepare_case_authorization(UUID, TEXT, TEXT, JSONB)
TO authenticated;

CREATE OR REPLACE VIEW public.concierge_case_representation_readiness
WITH (security_invoker = true)
AS
SELECT
  c.id AS case_id,
  c.patient_id,
  COALESCE((c.metadata->>'representation_required')::boolean, FALSE)
    AS representation_required,
  COALESCE((c.metadata->>'representation_ready')::boolean, FALSE)
    AS representation_ready,
  a.id AS authorization_id,
  a.status AS authorization_status,
  a.purpose,
  a.recipient,
  a.authorization_scope,
  a.signed_at
FROM public.concierge_operational_cases c
LEFT JOIN LATERAL (
  SELECT la.*
  FROM public.concierge_legal_authorizations la
  WHERE la.case_id = c.id
    AND la.patient_id = c.patient_id
    AND la.authorization_type = 'representation_authorization'
  ORDER BY la.updated_at DESC
  LIMIT 1
) a ON TRUE;

REVOKE ALL ON public.concierge_case_representation_readiness FROM anon;
GRANT SELECT ON public.concierge_case_representation_readiness TO authenticated;
GRANT SELECT ON public.concierge_case_representation_readiness TO service_role;

COMMIT;

-- Read-only postcheck
SELECT
  c.id AS case_id,
  c.status AS case_status,
  c.metadata->>'representation_required' AS representation_required,
  c.metadata->>'representation_ready' AS representation_ready,
  r.authorization_id,
  r.authorization_status,
  r.purpose,
  r.recipient,
  r.authorization_scope
FROM public.concierge_operational_cases c
LEFT JOIN public.concierge_case_representation_readiness r
  ON r.case_id = c.id
WHERE c.id = '967b2f66-bcbd-4213-9812-dbf0da7ab317'::uuid;
