-- =====================================================
-- HEALTH CONCIERGE - PILOT ANALYTICS V1
-- Run AFTER SQL_CONCIERGE_MVP_V1.sql, only in validation environment.
-- Purpose: measure the real operating model before pricing/scaling.
-- =====================================================

-- 1) Cohort fields: who has a health plan vs. who does not.
ALTER TABLE public.concierge_memberships
  ADD COLUMN IF NOT EXISTS has_health_plan BOOLEAN,
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT,
  ADD COLUMN IF NOT EXISTS monthly_price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS pilot_cohort TEXT DEFAULT 'mvp_100';

-- Role helper used only for operational administration.
CREATE OR REPLACE FUNCTION public.concierge_has_staff_role(required_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.concierge_staff s
    WHERE s.user_id = auth.uid()
      AND s.active = true
      AND s.role = ANY(required_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.concierge_has_staff_role(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_has_staff_role(TEXT[]) TO authenticated;

-- Coordinators need to see the staff roster to assign longitudinal care teams.
DROP POLICY IF EXISTS concierge_staff_coordination_read ON public.concierge_staff;
CREATE POLICY concierge_staff_coordination_read ON public.concierge_staff
  FOR SELECT TO authenticated
  USING (public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[]));

-- 2) Human workload log. This is the core unit-economics instrument.
CREATE TABLE IF NOT EXISTS public.concierge_work_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID REFERENCES public.concierge_requests(id) ON DELETE SET NULL,
  staff_role TEXT NOT NULL,
  work_type TEXT NOT NULL CHECK (work_type IN (
    'triage', 'message', 'clinical_review', 'care_coordination', 'action_plan', 'follow_up', 'teleconsult', 'other'
  )),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  outcome TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concierge_work_logs_staff ON public.concierge_work_logs(staff_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concierge_work_logs_patient ON public.concierge_work_logs(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concierge_work_logs_request ON public.concierge_work_logs(request_id, created_at DESC);

ALTER TABLE public.concierge_work_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS concierge_work_logs_staff_read ON public.concierge_work_logs;
CREATE POLICY concierge_work_logs_staff_read ON public.concierge_work_logs
  FOR SELECT TO authenticated
  USING (public.concierge_is_staff());

DROP POLICY IF EXISTS concierge_work_logs_staff_insert ON public.concierge_work_logs;
CREATE POLICY concierge_work_logs_staff_insert ON public.concierge_work_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.concierge_is_staff()
    AND staff_user_id = auth.uid()
  );

-- 3) When a staff member touches a new case for the first time, preserve response time.
CREATE OR REPLACE FUNCTION public.concierge_set_first_response()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.first_response_at IS NULL
     AND NEW.first_response_at IS NULL
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status <> 'new' THEN
    NEW.first_response_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concierge_first_response ON public.concierge_requests;
CREATE TRIGGER trg_concierge_first_response
BEFORE UPDATE ON public.concierge_requests
FOR EACH ROW EXECUTE FUNCTION public.concierge_set_first_response();

-- 4) Automatically transform a program checklist into patient actions.
CREATE OR REPLACE FUNCTION public.concierge_seed_program_actions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  checklist_item JSONB;
  item_text TEXT;
  item_position INTEGER := 0;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.concierge_actions a
    WHERE a.program_enrollment_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  FOR checklist_item IN
    SELECT value FROM jsonb_array_elements(
      COALESCE((SELECT default_checklist FROM public.concierge_programs WHERE id = NEW.program_id), '[]'::jsonb)
    )
  LOOP
    item_position := item_position + 1;
    item_text := trim(both '"' from checklist_item::text);

    INSERT INTO public.concierge_actions (
      patient_id,
      program_enrollment_id,
      created_by,
      category,
      title,
      due_date,
      priority,
      status,
      metadata
    ) VALUES (
      NEW.patient_id,
      NEW.id,
      NEW.assigned_by,
      'general',
      item_text,
      CURRENT_DATE + (item_position * 7),
      'normal',
      'pending',
      jsonb_build_object('generated_from_program', NEW.program_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concierge_seed_program_actions ON public.concierge_program_enrollments;
CREATE TRIGGER trg_concierge_seed_program_actions
AFTER INSERT ON public.concierge_program_enrollments
FOR EACH ROW EXECUTE FUNCTION public.concierge_seed_program_actions();

-- If an existing enrollment is reactivated and has no generated actions,
-- this helper can be called manually by toggling status or re-inserting in validation.

-- 5) Pilot KPIs query templates
-- Active members by segment:
-- SELECT has_health_plan, count(*)
-- FROM public.concierge_memberships
-- WHERE status IN ('pilot','active')
-- GROUP BY has_health_plan;
--
-- Doctor escalation rate:
-- SELECT
--   count(*) FILTER (WHERE escalated_at IS NOT NULL)::numeric / NULLIF(count(*),0) AS escalation_rate
-- FROM public.concierge_requests
-- WHERE created_at >= NOW() - INTERVAL '30 days';
--
-- Average first response (minutes):
-- SELECT avg(extract(epoch from (first_response_at - created_at)) / 60.0)
-- FROM public.concierge_requests
-- WHERE first_response_at IS NOT NULL
--   AND created_at >= NOW() - INTERVAL '30 days';
--
-- Human minutes per active patient:
-- SELECT
--   sum(duration_minutes)::numeric /
--   NULLIF(count(DISTINCT patient_id),0) AS human_minutes_per_patient
-- FROM public.concierge_work_logs
-- WHERE created_at >= NOW() - INTERVAL '30 days';
--
-- Workload by role:
-- SELECT staff_role, sum(duration_minutes) AS minutes, count(*) AS interactions
-- FROM public.concierge_work_logs
-- WHERE created_at >= NOW() - INTERVAL '30 days'
-- GROUP BY staff_role;
