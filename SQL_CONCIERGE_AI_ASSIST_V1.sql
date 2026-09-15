-- HEALTH CONCIERGE - AI ASSIST V1
-- Validation only. Internal professional assistance; no autonomous clinical action.

CREATE TABLE IF NOT EXISTS public.concierge_ai_assist_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.concierge_requests(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_role TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'case_brief',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.concierge_ai_assist_runs ENABLE ROW LEVEL SECURITY;
