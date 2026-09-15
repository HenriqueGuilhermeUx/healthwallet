-- HEALTH CONCIERGE - EXPLICIT PATIENT CONSENT V1
-- Validation environment only. Run after the core, analytics and access-guard migrations.

ALTER TABLE public.concierge_memberships
  ADD COLUMN IF NOT EXISTS consent_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS consent_scope JSONB NOT NULL DEFAULT '{"summary":true,"exams":true,"medications":true,"timeline":true,"passport":true,"medscore":true,"device_data":true,"daily_summaries":true,"documents":true,"family":false}'::jsonb,
  ADD COLUMN IF NOT EXISTS consent_version TEXT,
  ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_revoked_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'concierge_memberships_consent_status_check'
  ) THEN
    ALTER TABLE public.concierge_memberships
      ADD CONSTRAINT concierge_memberships_consent_status_check
      CHECK (consent_status IN ('pending','accepted','revoked'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.concierge_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.concierge_memberships(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('accepted','revoked')),
  consent_version TEXT,
  consent_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concierge_consent_events_patient
  ON public.concierge_consent_events(patient_id, created_at DESC);

ALTER TABLE public.concierge_consent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS concierge_consent_events_patient_read ON public.concierge_consent_events;
CREATE POLICY concierge_consent_events_patient_read ON public.concierge_consent_events
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid());

DROP POLICY IF EXISTS concierge_consent_events_coord_read ON public.concierge_consent_events;
CREATE POLICY concierge_consent_events_coord_read ON public.concierge_consent_events
  FOR SELECT TO authenticated
  USING (public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[]));

CREATE OR REPLACE FUNCTION public.concierge_has_active_consent(target_patient UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.concierge_memberships m
    WHERE m.patient_id = target_patient
      AND m.status IN ('pilot','active')
      AND m.consent_status = 'accepted'
      AND m.consented_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.concierge_has_active_consent(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_has_active_consent(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.concierge_accept_consent(
  requested_scope JSONB DEFAULT NULL,
  requested_version TEXT DEFAULT 'concierge-consent-v1'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  membership_id UUID;
  effective_scope JSONB;
BEGIN
  SELECT m.id, COALESCE(requested_scope, m.consent_scope)
    INTO membership_id, effective_scope
  FROM public.concierge_memberships m
  WHERE m.patient_id = auth.uid();

  IF membership_id IS NULL THEN
    RAISE EXCEPTION 'Concierge membership not found';
  END IF;

  UPDATE public.concierge_memberships
  SET consent_status = 'accepted',
      consent_scope = effective_scope,
      consent_version = requested_version,
      consented_at = NOW(),
      consent_revoked_at = NULL,
      status = CASE WHEN status = 'paused' THEN 'pilot' ELSE status END,
      updated_at = NOW()
  WHERE id = membership_id;

  INSERT INTO public.concierge_consent_events (
    patient_id, membership_id, event_type, consent_version, consent_scope, actor_user_id
  ) VALUES (
    auth.uid(), membership_id, 'accepted', requested_version, effective_scope, auth.uid()
  );

  RETURN membership_id;
END;
$$;

REVOKE ALL ON FUNCTION public.concierge_accept_consent(JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_accept_consent(JSONB, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.concierge_revoke_consent()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  membership_id UUID;
  current_scope JSONB;
  current_version TEXT;
BEGIN
  SELECT m.id, m.consent_scope, m.consent_version
    INTO membership_id, current_scope, current_version
  FROM public.concierge_memberships m
  WHERE m.patient_id = auth.uid();

  IF membership_id IS NULL THEN
    RAISE EXCEPTION 'Concierge membership not found';
  END IF;

  UPDATE public.concierge_memberships
  SET consent_status = 'revoked',
      consent_revoked_at = NOW(),
      status = CASE WHEN status IN ('pilot','active') THEN 'paused' ELSE status END,
      updated_at = NOW()
  WHERE id = membership_id;

  INSERT INTO public.concierge_consent_events (
    patient_id, membership_id, event_type, consent_version, consent_scope, actor_user_id
  ) VALUES (
    auth.uid(), membership_id, 'revoked', current_version, current_scope, auth.uid()
  );

  RETURN membership_id;
END;
$$;

REVOKE ALL ON FUNCTION public.concierge_revoke_consent() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_revoke_consent() TO authenticated;

-- Staff access now requires both operational authorization and active patient consent.
CREATE OR REPLACE FUNCTION public.concierge_can_access_patient(target_patient UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.concierge_has_active_consent(target_patient)
    AND (
      public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[])
      OR EXISTS (
        SELECT 1 FROM public.concierge_assignments a
        WHERE a.patient_id = target_patient
          AND a.professional_id = auth.uid()
          AND a.status = 'active'
      )
    );
$$;

REVOKE ALL ON FUNCTION public.concierge_can_access_patient(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_can_access_patient(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.concierge_can_access_request(target_request UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.concierge_requests r
    LEFT JOIN public.concierge_staff s
      ON s.user_id = auth.uid() AND s.active = true
    WHERE r.id = target_request
      AND public.concierge_has_active_consent(r.patient_id)
      AND (
        s.role IN ('admin','care_coordinator')
        OR r.assigned_nurse_id = auth.uid()
        OR r.assigned_doctor_id = auth.uid()
        OR (
          s.role = 'nurse'
          AND r.assigned_nurse_id IS NULL
          AND r.assigned_doctor_id IS NULL
          AND r.status IN ('new','waiting_nurse')
        )
        OR (
          s.role = 'doctor'
          AND r.assigned_doctor_id IS NULL
          AND r.status IN ('escalated_medical','medical_review')
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.concierge_can_access_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_can_access_request(UUID) TO authenticated;

-- Patients can create new Concierge work only while consent is active.
DROP POLICY IF EXISTS concierge_requests_patient_insert ON public.concierge_requests;
CREATE POLICY concierge_requests_patient_insert ON public.concierge_requests
  FOR INSERT TO authenticated
  WITH CHECK (patient_id = auth.uid() AND public.concierge_has_active_consent(auth.uid()));

DROP POLICY IF EXISTS concierge_events_patient_insert ON public.concierge_request_events;
CREATE POLICY concierge_events_patient_insert ON public.concierge_request_events
  FOR INSERT TO authenticated
  WITH CHECK (
    patient_id = auth.uid()
    AND actor_user_id = auth.uid()
    AND actor_role = 'patient'
    AND visibility = 'patient'
    AND public.concierge_has_active_consent(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.concierge_requests r
      WHERE r.id = request_id AND r.patient_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS concierge_enrollments_patient_insert ON public.concierge_program_enrollments;
CREATE POLICY concierge_enrollments_patient_insert ON public.concierge_program_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (patient_id = auth.uid() AND public.concierge_has_active_consent(auth.uid()));

DROP POLICY IF EXISTS concierge_enrollments_patient_update ON public.concierge_program_enrollments;
CREATE POLICY concierge_enrollments_patient_update ON public.concierge_program_enrollments
  FOR UPDATE TO authenticated
  USING (patient_id = auth.uid() AND public.concierge_has_active_consent(auth.uid()))
  WITH CHECK (patient_id = auth.uid() AND public.concierge_has_active_consent(auth.uid()));
