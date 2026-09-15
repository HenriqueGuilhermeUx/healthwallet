-- HEALTH CONCIERGE - REQUEST-SCOPED PROFESSIONAL CONTEXT V1
-- Validation environment only. Run after explicit Concierge consent.
-- Returns only context needed for an authorized request; no blanket patient export.

CREATE TABLE IF NOT EXISTS public.concierge_context_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES public.concierge_requests(id) ON DELETE CASCADE,
  consent_version TEXT,
  purpose TEXT NOT NULL DEFAULT 'request_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concierge_context_access_patient
  ON public.concierge_context_access_logs(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concierge_context_access_request
  ON public.concierge_context_access_logs(request_id, created_at DESC);

ALTER TABLE public.concierge_context_access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS concierge_context_logs_patient_read ON public.concierge_context_access_logs;
CREATE POLICY concierge_context_logs_patient_read ON public.concierge_context_access_logs
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid());

DROP POLICY IF EXISTS concierge_context_logs_coord_read ON public.concierge_context_access_logs;
CREATE POLICY concierge_context_logs_coord_read ON public.concierge_context_access_logs
  FOR SELECT TO authenticated
  USING (public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[]));

CREATE OR REPLACE FUNCTION public.concierge_get_request_context(target_request UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.concierge_requests;
  membership public.concierge_memberships;
  result JSONB := '{}'::jsonb;
  section JSONB;
BEGIN
  IF NOT public.concierge_can_access_request(target_request) THEN
    RAISE EXCEPTION 'Concierge request access denied';
  END IF;

  SELECT * INTO req
  FROM public.concierge_requests
  WHERE id = target_request;

  SELECT * INTO membership
  FROM public.concierge_memberships
  WHERE patient_id = req.patient_id
    AND status IN ('pilot','active')
    AND consent_status = 'accepted'
  LIMIT 1;

  IF membership.id IS NULL THEN
    RAISE EXCEPTION 'Active patient consent required';
  END IF;

  result := jsonb_build_object(
    'request_id', req.id,
    'patient_id', req.patient_id,
    'consent_version', membership.consent_version,
    'generated_at', NOW()
  );

  IF COALESCE((membership.consent_scope->>'medscore')::boolean, false)
     AND to_regclass('public.health_scores') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(
        jsonb_build_object(
          'score', s.score,
          'status', s.status,
          'factors', s.factors,
          'calculated_at', s.calculated_at
        ), '{}'::jsonb
      )
      FROM public.health_scores s
      WHERE s.user_id = $1
      ORDER BY s.calculated_at DESC
      LIMIT 1
    $q$ INTO section USING req.patient_id;
    result := result || jsonb_build_object('medscore', COALESCE(section, '{}'::jsonb));
  END IF;

  IF COALESCE((membership.consent_scope->>'medications')::boolean, false)
     AND to_regclass('public.medications') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'dosage', m.dosage,
        'frequency', m.frequency,
        'start_date', m.start_date,
        'end_date', m.end_date,
        'notes', m.notes
      ) ORDER BY m.created_at DESC), '[]'::jsonb)
      FROM public.medications m
      WHERE m.user_id = $1
        AND COALESCE(m.is_active, true) = true
    $q$ INTO section USING req.patient_id;
    result := result || jsonb_build_object('active_medications', COALESCE(section, '[]'::jsonb));
  END IF;

  IF COALESCE((membership.consent_scope->>'exams')::boolean, false)
     AND to_regclass('public.medical_records') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'file_name', r.file_name,
        'exam_type', r.exam_type,
        'exam_date', r.exam_date,
        'laboratory', r.laboratory,
        'status', r.status,
        'extracted_data', r.extracted_data,
        'ai_analysis', r.ai_analysis
      ) ORDER BY r.created_at DESC), '[]'::jsonb)
      FROM public.medical_records r
      WHERE r.user_id = $1
        AND r.id::text IN (
          SELECT item->>'id'
          FROM jsonb_array_elements(COALESCE($2->'linked_exams', '[]'::jsonb)) item
        )
    $q$ INTO section USING req.patient_id, req.context_snapshot;
    result := result || jsonb_build_object('linked_exams', COALESCE(section, '[]'::jsonb));
  END IF;

  IF COALESCE((membership.consent_scope->>'daily_summaries')::boolean, false)
     AND to_regclass('public.health_daily_summaries') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.summary_date DESC), '[]'::jsonb)
      FROM (
        SELECT *
        FROM public.health_daily_summaries
        WHERE user_id = $1
        ORDER BY summary_date DESC
        LIMIT 14
      ) d
    $q$ INTO section USING req.patient_id;
    result := result || jsonb_build_object('recent_device_summaries', COALESCE(section, '[]'::jsonb));
  END IF;

  INSERT INTO public.concierge_context_access_logs (
    actor_user_id, patient_id, request_id, consent_version, purpose
  ) VALUES (
    auth.uid(), req.patient_id, req.id, membership.consent_version, 'request_review'
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.concierge_get_request_context(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_get_request_context(UUID) TO authenticated;
