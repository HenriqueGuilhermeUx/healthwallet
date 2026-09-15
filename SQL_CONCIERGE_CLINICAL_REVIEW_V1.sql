-- =====================================================
-- HEALTH CONCIERGE - STRUCTURED REVIEW V1
-- Run after the core Concierge migrations in validation.
-- Supports professional second-analysis / exam / medication review.
-- The software does not finalize clinical conclusions autonomously.
-- =====================================================

ALTER TABLE public.concierge_requests
  ADD COLUMN IF NOT EXISTS subject_family_member_id UUID;

DO $$
BEGIN
  IF to_regclass('public.family_members') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'concierge_requests_family_member_fk'
     ) THEN
    ALTER TABLE public.concierge_requests
      ADD CONSTRAINT concierge_requests_family_member_fk
      FOREIGN KEY (subject_family_member_id)
      REFERENCES public.family_members(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.concierge_clinical_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES public.concierge_requests(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL CHECK (review_type IN ('second_analysis','exam_review','medication_review','medical_review')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready_for_physician','completed','cancelled')),

  -- Structured professional work product.
  case_summary TEXT,
  relevant_findings TEXT,
  points_to_consider TEXT,
  uncertainties TEXT,
  recommendations TEXT,
  next_steps TEXT,
  questions_for_patient TEXT,

  prepared_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  prepared_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  patient_visible BOOLEAN NOT NULL DEFAULT false,
  disclaimer TEXT NOT NULL DEFAULT 'Esta revisão organiza informações e o parecer profissional registrado. Não substitui atendimento de urgência nem deve ser interpretada fora do contexto clínico.',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concierge_clinical_reviews_patient
  ON public.concierge_clinical_reviews(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concierge_clinical_reviews_status
  ON public.concierge_clinical_reviews(status, created_at ASC);

ALTER TABLE public.concierge_clinical_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS concierge_reviews_patient_read ON public.concierge_clinical_reviews;
CREATE POLICY concierge_reviews_patient_read ON public.concierge_clinical_reviews
  FOR SELECT TO authenticated
  USING (
    patient_id = auth.uid()
    AND status = 'completed'
    AND patient_visible = true
  );

DROP POLICY IF EXISTS concierge_reviews_staff_read ON public.concierge_clinical_reviews;
CREATE POLICY concierge_reviews_staff_read ON public.concierge_clinical_reviews
  FOR SELECT TO authenticated
  USING (public.concierge_can_access_request(request_id));

DROP POLICY IF EXISTS concierge_reviews_staff_insert ON public.concierge_clinical_reviews;
CREATE POLICY concierge_reviews_staff_insert ON public.concierge_clinical_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    public.concierge_can_access_request(request_id)
    AND patient_id = (SELECT r.patient_id FROM public.concierge_requests r WHERE r.id = request_id)
  );

DROP POLICY IF EXISTS concierge_reviews_staff_update ON public.concierge_clinical_reviews;
CREATE POLICY concierge_reviews_staff_update ON public.concierge_clinical_reviews
  FOR UPDATE TO authenticated
  USING (public.concierge_can_access_request(request_id))
  WITH CHECK (public.concierge_can_access_request(request_id));

CREATE OR REPLACE FUNCTION public.concierge_guard_clinical_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_role TEXT;
BEGIN
  SELECT s.role INTO current_role
  FROM public.concierge_staff s
  WHERE s.user_id = auth.uid() AND s.active = true;

  IF current_role IS NULL THEN
    RAISE EXCEPTION 'Concierge staff role required';
  END IF;

  -- Nurses/coordinators can prepare a structured case, but a final patient-visible
  -- clinical review requires physician/admin completion.
  IF NEW.status = 'completed' AND NEW.patient_visible = true THEN
    IF current_role NOT IN ('doctor','admin') THEN
      RAISE EXCEPTION 'Physician review required before publishing a clinical review';
    END IF;

    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, NOW());
  ELSE
    NEW.prepared_by := COALESCE(NEW.prepared_by, auth.uid());
    NEW.prepared_at := COALESCE(NEW.prepared_at, NOW());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concierge_guard_clinical_review ON public.concierge_clinical_reviews;
CREATE TRIGGER trg_concierge_guard_clinical_review
BEFORE INSERT OR UPDATE ON public.concierge_clinical_reviews
FOR EACH ROW EXECUTE FUNCTION public.concierge_guard_clinical_review();

DROP TRIGGER IF EXISTS trg_concierge_reviews_updated_at ON public.concierge_clinical_reviews;
CREATE TRIGGER trg_concierge_reviews_updated_at
BEFORE UPDATE ON public.concierge_clinical_reviews
FOR EACH ROW EXECUTE FUNCTION public.set_concierge_updated_at();

-- Patient-facing completion event.
CREATE OR REPLACE FUNCTION public.concierge_publish_review_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND NEW.patient_visible = true
     AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.patient_visible IS DISTINCT FROM NEW.patient_visible) THEN
    INSERT INTO public.concierge_request_events (
      request_id,
      patient_id,
      actor_user_id,
      actor_role,
      event_type,
      visibility,
      message,
      payload
    ) VALUES (
      NEW.request_id,
      NEW.patient_id,
      NEW.reviewed_by,
      'doctor',
      'clinical_review_completed',
      'patient',
      'A revisão profissional foi concluída e está disponível no seu caso.',
      jsonb_build_object('review_id', NEW.id, 'review_type', NEW.review_type)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concierge_publish_review_event ON public.concierge_clinical_reviews;
CREATE TRIGGER trg_concierge_publish_review_event
AFTER UPDATE ON public.concierge_clinical_reviews
FOR EACH ROW EXECUTE FUNCTION public.concierge_publish_review_event();
