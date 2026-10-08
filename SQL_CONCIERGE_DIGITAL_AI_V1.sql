-- HealthWallet Concierge Digital AI V1
-- Paid digital concierge chat, voice transcript logging and human handoff.

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE TABLE IF NOT EXISTS public.concierge_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ai_active'
    CHECK (status IN ('ai_active','attention','human_requested','human_active','closed')),
  channel TEXT NOT NULL DEFAULT 'text'
    CHECK (channel IN ('text','voice','mixed','whatsapp')),
  assigned_staff_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  attention_reason TEXT,
  human_requested_at TIMESTAMPTZ,
  human_joined_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.concierge_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.concierge_chat_sessions(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL
    CHECK (actor_role IN ('patient','ai','concierge','nurse','doctor','care_coordinator','admin','system')),
  source TEXT NOT NULL DEFAULT 'text'
    CHECK (source IN ('text','voice','system','whatsapp','image','document')),
  visibility TEXT NOT NULL DEFAULT 'patient'
    CHECK (visibility IN ('patient','staff_only')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS concierge_chat_sessions_patient_idx
  ON public.concierge_chat_sessions(patient_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS concierge_chat_sessions_status_idx
  ON public.concierge_chat_sessions(status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS concierge_chat_messages_session_idx
  ON public.concierge_chat_messages(session_id, created_at ASC);

ALTER TABLE public.concierge_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.concierge_chat_staff_role(p_user UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  resolved_role TEXT;
BEGIN
  IF to_regclass('public.concierge_staff') IS NOT NULL THEN
    EXECUTE $q$
      SELECT role
      FROM public.concierge_staff
      WHERE user_id = $1
        AND active = true
      LIMIT 1
    $q$
    INTO resolved_role
    USING p_user;
  END IF;

  IF resolved_role IS NULL AND to_regclass('public.mydatamed_team_members') IS NOT NULL THEN
    EXECUTE $q$
      SELECT role
      FROM public.mydatamed_team_members
      WHERE user_id = $1
        AND active = true
        AND role IN ('master','admin','care_coordinator','concierge_agent','nurse','doctor')
      LIMIT 1
    $q$
    INTO resolved_role
    USING p_user;
  END IF;

  RETURN resolved_role;
END;
$$;

CREATE OR REPLACE FUNCTION private.concierge_chat_is_staff(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.concierge_chat_staff_role(p_user) IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION private.concierge_chat_staff_role(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.concierge_chat_is_staff(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.concierge_chat_staff_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.concierge_chat_is_staff(UUID) TO authenticated;

DROP POLICY IF EXISTS concierge_chat_sessions_patient_select ON public.concierge_chat_sessions;
CREATE POLICY concierge_chat_sessions_patient_select
ON public.concierge_chat_sessions FOR SELECT TO authenticated
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS concierge_chat_sessions_staff_select ON public.concierge_chat_sessions;
CREATE POLICY concierge_chat_sessions_staff_select
ON public.concierge_chat_sessions FOR SELECT TO authenticated
USING (private.concierge_chat_is_staff(auth.uid()));

DROP POLICY IF EXISTS concierge_chat_sessions_staff_update ON public.concierge_chat_sessions;
CREATE POLICY concierge_chat_sessions_staff_update
ON public.concierge_chat_sessions FOR UPDATE TO authenticated
USING (private.concierge_chat_is_staff(auth.uid()))
WITH CHECK (private.concierge_chat_is_staff(auth.uid()));

DROP POLICY IF EXISTS concierge_chat_messages_patient_select ON public.concierge_chat_messages;
CREATE POLICY concierge_chat_messages_patient_select
ON public.concierge_chat_messages FOR SELECT TO authenticated
USING (patient_id = auth.uid() AND visibility = 'patient');

DROP POLICY IF EXISTS concierge_chat_messages_staff_select ON public.concierge_chat_messages;
CREATE POLICY concierge_chat_messages_staff_select
ON public.concierge_chat_messages FOR SELECT TO authenticated
USING (private.concierge_chat_is_staff(auth.uid()));

DROP POLICY IF EXISTS concierge_chat_messages_staff_insert ON public.concierge_chat_messages;
CREATE POLICY concierge_chat_messages_staff_insert
ON public.concierge_chat_messages FOR INSERT TO authenticated
WITH CHECK (
  private.concierge_chat_is_staff(auth.uid())
  AND actor_user_id = auth.uid()
  AND actor_role IN ('concierge','nurse','doctor','care_coordinator','admin')
);

GRANT SELECT, UPDATE ON public.concierge_chat_sessions TO authenticated;
GRANT SELECT, INSERT ON public.concierge_chat_messages TO authenticated;

-- Explicit Data API grants: required for new public tables as Supabase moves
-- away from automatic exposure. service_role is server-side only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concierge_chat_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concierge_chat_messages TO service_role;

CREATE OR REPLACE FUNCTION private.concierge_chat_request_human_impl(
  p_user_id UUID,
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.concierge_chat_sessions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'invalid caller';
  END IF;

  SELECT * INTO target
  FROM public.concierge_chat_sessions
  WHERE id = p_session_id
    AND patient_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'chat session not found';
  END IF;

  UPDATE public.concierge_chat_sessions
  SET status = 'human_requested',
      human_requested_at = COALESCE(human_requested_at, NOW()),
      last_activity_at = NOW()
  WHERE id = p_session_id;

  INSERT INTO public.concierge_chat_messages (
    session_id, patient_id, actor_role, source, visibility, content
  ) VALUES (
    p_session_id, p_user_id, 'system', 'system', 'patient',
    'Atendimento humano solicitado. Sua equipe foi avisada e entrará assim que possível.'
  );

  RETURN jsonb_build_object('ok', true, 'status', 'human_requested');
END;
$$;

CREATE OR REPLACE FUNCTION private.concierge_chat_staff_take_impl(
  p_user_id UUID,
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  staff_role TEXT;
  target public.concierge_chat_sessions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'invalid caller';
  END IF;

  SELECT private.concierge_chat_staff_role(p_user_id) INTO staff_role;

  IF staff_role IS NULL OR staff_role NOT IN ('master','admin','care_coordinator','nurse','doctor','concierge_agent') THEN
    RAISE EXCEPTION 'staff access required';
  END IF;

  SELECT * INTO target
  FROM public.concierge_chat_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'chat session not found';
  END IF;

  UPDATE public.concierge_chat_sessions
  SET status = 'human_active',
      assigned_staff_id = p_user_id,
      human_joined_at = COALESCE(human_joined_at, NOW()),
      last_activity_at = NOW()
  WHERE id = p_session_id;

  INSERT INTO public.concierge_chat_messages (
    session_id, patient_id, actor_user_id, actor_role, source, visibility, content
  ) VALUES (
    p_session_id, target.patient_id, p_user_id,
    CASE
      WHEN staff_role = 'care_coordinator' THEN 'care_coordinator'
      WHEN staff_role = 'nurse' THEN 'nurse'
      WHEN staff_role = 'doctor' THEN 'doctor'
      WHEN staff_role IN ('master','admin') THEN 'admin'
      ELSE 'concierge'
    END,
    'system','patient','Uma pessoa da equipe Concierge entrou na conversa.'
  );

  RETURN jsonb_build_object('ok', true, 'status', 'human_active');
END;
$$;

CREATE OR REPLACE FUNCTION private.concierge_chat_staff_return_to_ai_impl(
  p_user_id UUID,
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.concierge_chat_sessions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'invalid caller';
  END IF;

  IF NOT private.concierge_chat_is_staff(p_user_id) THEN
    RAISE EXCEPTION 'staff access required';
  END IF;

  SELECT * INTO target
  FROM public.concierge_chat_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'chat session not found';
  END IF;

  UPDATE public.concierge_chat_sessions
  SET status = 'ai_active',
      assigned_staff_id = NULL,
      attention_reason = NULL,
      human_requested_at = NULL,
      last_activity_at = NOW()
  WHERE id = p_session_id;

  INSERT INTO public.concierge_chat_messages (
    session_id, patient_id, actor_role, source, visibility, content
  ) VALUES (
    p_session_id, target.patient_id, 'system', 'system', 'patient',
    'A equipe concluiu esta intervenção. O Concierge Digital continua acompanhando você.'
  );

  RETURN jsonb_build_object('ok', true, 'status', 'ai_active');
END;
$$;

REVOKE ALL ON FUNCTION private.concierge_chat_request_human_impl(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.concierge_chat_staff_take_impl(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.concierge_chat_staff_return_to_ai_impl(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.concierge_chat_request_human_impl(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.concierge_chat_staff_take_impl(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.concierge_chat_staff_return_to_ai_impl(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.concierge_chat_request_human(p_session_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.concierge_chat_request_human_impl(auth.uid(), p_session_id);
$$;

CREATE OR REPLACE FUNCTION public.concierge_chat_staff_take(p_session_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.concierge_chat_staff_take_impl(auth.uid(), p_session_id);
$$;

CREATE OR REPLACE FUNCTION public.concierge_chat_staff_return_to_ai(p_session_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.concierge_chat_staff_return_to_ai_impl(auth.uid(), p_session_id);
$$;

REVOKE ALL ON FUNCTION public.concierge_chat_request_human(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.concierge_chat_staff_take(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.concierge_chat_staff_return_to_ai(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concierge_chat_request_human(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.concierge_chat_staff_take(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.concierge_chat_staff_return_to_ai(UUID) TO authenticated;

-- Realtime keeps patient and staff consoles synchronized without storing audio.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.concierge_chat_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.concierge_chat_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
