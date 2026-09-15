-- =====================================================
-- HEALTHWALLET / MYDATAMED - HEALTH CONCIERGE MVP V1
-- Execute no Supabase SQL Editor only when we are ready to validate the MVP.
-- This migration is intentionally NOT deployed by CI.
--
-- Product model:
-- HealthWallet = patient data layer
-- Concierge    = continuous coordination layer
-- MyDataMed    = professional operations layer
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------
-- 1) Staff authorized to operate the Concierge
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_staff (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('nurse', 'doctor', 'admin', 'care_coordinator')),
  display_name TEXT,
  professional_registration TEXT,
  specialty TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------
-- 2) Patient enrollment / subscription state
-- No billing assumptions here. It is an operational enrollment.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pilot' CHECK (status IN ('pilot', 'active', 'paused', 'cancelled')),
  plan_code TEXT NOT NULL DEFAULT 'concierge_pilot',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paused_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(patient_id)
);

-- -----------------------------------------------------
-- 3) Longitudinal care team assignment
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('nurse', 'doctor', 'care_coordinator', 'specialist')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  professional_name TEXT,
  specialty TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(patient_id, professional_id, role)
);

-- -----------------------------------------------------
-- 4) Patient requests = trackable care cases
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_name TEXT,
  subject_relationship TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'symptom',
    'guidance',
    'exam_review',
    'second_analysis',
    'medication_review',
    'navigation',
    'other'
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  symptom_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  urgency TEXT NOT NULL DEFAULT 'routine' CHECK (urgency IN ('routine', 'priority', 'urgent_redirect')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new',
    'in_triage',
    'waiting_patient',
    'waiting_nurse',
    'escalated_medical',
    'medical_review',
    'action_plan',
    'resolved',
    'closed'
  )),
  assigned_nurse_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_doctor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_response_at TIMESTAMPTZ,
  triaged_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  resolution_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------
-- 5) Case timeline / messages / professional notes
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.concierge_requests(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL DEFAULT 'system',
  event_type TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'patient' CHECK (visibility IN ('patient', 'staff_only')),
  message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------
-- 6) Action plan = recurrence engine
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID REFERENCES public.concierge_requests(id) ON DELETE SET NULL,
  program_enrollment_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_professional_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN (
    'exam', 'vaccine', 'return', 'medication', 'activity', 'sleep', 'nutrition', 'monitoring', 'education', 'general'
  )),
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  completed_at TIMESTAMPTZ,
  completion_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------
-- 7) Health programs
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  target TEXT,
  icon TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  default_goals JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.concierge_program_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.concierge_programs(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  goals JSONB NOT NULL DEFAULT '[]'::jsonb,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(patient_id, program_id)
);

-- Add FK only after enrollment table exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'concierge_actions_program_enrollment_fk'
  ) THEN
    ALTER TABLE public.concierge_actions
      ADD CONSTRAINT concierge_actions_program_enrollment_fk
      FOREIGN KEY (program_enrollment_id)
      REFERENCES public.concierge_program_enrollments(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- -----------------------------------------------------
-- 8) Alerts generated by MedScore / wearables / workflow
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('medscore', 'wearable', 'exam', 'medication', 'action', 'manual', 'system')),
  source_id TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'attention', 'high')),
  title TEXT NOT NULL,
  explanation TEXT,
  suggested_action TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------
-- 9) Useful indexes
-- -----------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_concierge_requests_patient_status ON public.concierge_requests(patient_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concierge_requests_nurse ON public.concierge_requests(assigned_nurse_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concierge_requests_doctor ON public.concierge_requests(assigned_doctor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concierge_events_request ON public.concierge_request_events(request_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_concierge_actions_patient ON public.concierge_actions(patient_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_concierge_alerts_patient ON public.concierge_alerts(patient_id, status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concierge_assignments_patient ON public.concierge_assignments(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_concierge_assignments_professional ON public.concierge_assignments(professional_id, status);

-- -----------------------------------------------------
-- 10) updated_at trigger
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_concierge_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'concierge_staff',
    'concierge_memberships',
    'concierge_assignments',
    'concierge_requests',
    'concierge_actions',
    'concierge_programs',
    'concierge_program_enrollments',
    'concierge_alerts'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_concierge_updated_at()',
      table_name,
      table_name
    );
  END LOOP;
END $$;

-- -----------------------------------------------------
-- 11) Staff helper. Keeps Concierge RLS independent from
-- existing HealthWallet medical-data RLS.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.concierge_is_staff()
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
  );
$$;

REVOKE ALL ON FUNCTION public.concierge_is_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_is_staff() TO authenticated;

-- -----------------------------------------------------
-- 12) RLS
-- -----------------------------------------------------
ALTER TABLE public.concierge_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_program_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_alerts ENABLE ROW LEVEL SECURITY;

-- Staff can read own staff record; admins can manage via service role / SQL during pilot.
DROP POLICY IF EXISTS concierge_staff_read_self ON public.concierge_staff;
CREATE POLICY concierge_staff_read_self ON public.concierge_staff
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Membership
DROP POLICY IF EXISTS concierge_memberships_patient_read ON public.concierge_memberships;
CREATE POLICY concierge_memberships_patient_read ON public.concierge_memberships
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid() OR public.concierge_is_staff());

DROP POLICY IF EXISTS concierge_memberships_staff_manage ON public.concierge_memberships;
CREATE POLICY concierge_memberships_staff_manage ON public.concierge_memberships
  FOR ALL TO authenticated
  USING (public.concierge_is_staff())
  WITH CHECK (public.concierge_is_staff());

-- Assignments
DROP POLICY IF EXISTS concierge_assignments_read ON public.concierge_assignments;
CREATE POLICY concierge_assignments_read ON public.concierge_assignments
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid() OR professional_id = auth.uid() OR public.concierge_is_staff());

DROP POLICY IF EXISTS concierge_assignments_staff_manage ON public.concierge_assignments;
CREATE POLICY concierge_assignments_staff_manage ON public.concierge_assignments
  FOR ALL TO authenticated
  USING (public.concierge_is_staff())
  WITH CHECK (public.concierge_is_staff());

-- Requests
DROP POLICY IF EXISTS concierge_requests_patient_read ON public.concierge_requests;
CREATE POLICY concierge_requests_patient_read ON public.concierge_requests
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid() OR public.concierge_is_staff());

DROP POLICY IF EXISTS concierge_requests_patient_insert ON public.concierge_requests;
CREATE POLICY concierge_requests_patient_insert ON public.concierge_requests
  FOR INSERT TO authenticated
  WITH CHECK (patient_id = auth.uid());

DROP POLICY IF EXISTS concierge_requests_staff_update ON public.concierge_requests;
CREATE POLICY concierge_requests_staff_update ON public.concierge_requests
  FOR UPDATE TO authenticated
  USING (public.concierge_is_staff())
  WITH CHECK (public.concierge_is_staff());

-- Events
DROP POLICY IF EXISTS concierge_events_read ON public.concierge_request_events;
CREATE POLICY concierge_events_read ON public.concierge_request_events
  FOR SELECT TO authenticated
  USING (
    patient_id = auth.uid()
    OR public.concierge_is_staff()
  );

DROP POLICY IF EXISTS concierge_events_patient_insert ON public.concierge_request_events;
CREATE POLICY concierge_events_patient_insert ON public.concierge_request_events
  FOR INSERT TO authenticated
  WITH CHECK (
    patient_id = auth.uid()
    AND actor_user_id = auth.uid()
    AND actor_role = 'patient'
    AND visibility = 'patient'
    AND EXISTS (
      SELECT 1 FROM public.concierge_requests r
      WHERE r.id = request_id AND r.patient_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS concierge_events_staff_insert ON public.concierge_request_events;
CREATE POLICY concierge_events_staff_insert ON public.concierge_request_events
  FOR INSERT TO authenticated
  WITH CHECK (public.concierge_is_staff());

-- Actions
DROP POLICY IF EXISTS concierge_actions_read ON public.concierge_actions;
CREATE POLICY concierge_actions_read ON public.concierge_actions
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid() OR public.concierge_is_staff());

DROP POLICY IF EXISTS concierge_actions_patient_complete ON public.concierge_actions;
CREATE POLICY concierge_actions_patient_complete ON public.concierge_actions
  FOR UPDATE TO authenticated
  USING (patient_id = auth.uid())
  WITH CHECK (patient_id = auth.uid());

DROP POLICY IF EXISTS concierge_actions_staff_manage ON public.concierge_actions;
CREATE POLICY concierge_actions_staff_manage ON public.concierge_actions
  FOR ALL TO authenticated
  USING (public.concierge_is_staff())
  WITH CHECK (public.concierge_is_staff());

-- Programs are readable by any logged-in HealthWallet user.
DROP POLICY IF EXISTS concierge_programs_read ON public.concierge_programs;
CREATE POLICY concierge_programs_read ON public.concierge_programs
  FOR SELECT TO authenticated
  USING (active = true OR public.concierge_is_staff());

DROP POLICY IF EXISTS concierge_programs_staff_manage ON public.concierge_programs;
CREATE POLICY concierge_programs_staff_manage ON public.concierge_programs
  FOR ALL TO authenticated
  USING (public.concierge_is_staff())
  WITH CHECK (public.concierge_is_staff());

-- Program enrollments
DROP POLICY IF EXISTS concierge_enrollments_read ON public.concierge_program_enrollments;
CREATE POLICY concierge_enrollments_read ON public.concierge_program_enrollments
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid() OR public.concierge_is_staff());

DROP POLICY IF EXISTS concierge_enrollments_patient_insert ON public.concierge_program_enrollments;
CREATE POLICY concierge_enrollments_patient_insert ON public.concierge_program_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (patient_id = auth.uid());

DROP POLICY IF EXISTS concierge_enrollments_patient_update ON public.concierge_program_enrollments;
CREATE POLICY concierge_enrollments_patient_update ON public.concierge_program_enrollments
  FOR UPDATE TO authenticated
  USING (patient_id = auth.uid())
  WITH CHECK (patient_id = auth.uid());

DROP POLICY IF EXISTS concierge_enrollments_staff_manage ON public.concierge_program_enrollments;
CREATE POLICY concierge_enrollments_staff_manage ON public.concierge_program_enrollments
  FOR ALL TO authenticated
  USING (public.concierge_is_staff())
  WITH CHECK (public.concierge_is_staff());

-- Alerts
DROP POLICY IF EXISTS concierge_alerts_read ON public.concierge_alerts;
CREATE POLICY concierge_alerts_read ON public.concierge_alerts
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid() OR public.concierge_is_staff());

DROP POLICY IF EXISTS concierge_alerts_staff_manage ON public.concierge_alerts;
CREATE POLICY concierge_alerts_staff_manage ON public.concierge_alerts
  FOR ALL TO authenticated
  USING (public.concierge_is_staff())
  WITH CHECK (public.concierge_is_staff());

-- -----------------------------------------------------
-- 13) Seed programs for MVP
-- -----------------------------------------------------
INSERT INTO public.concierge_programs (slug, name, description, target, default_goals, default_checklist)
VALUES
  ('hypertension', 'Hipertensão', 'Acompanhamento de pressão, hábitos, exames e retornos.', 'Pessoas com hipertensão ou necessidade de acompanhamento pressórico.', '["Acompanhar pressão regularmente","Manter retornos e exames em dia","Apoiar hábitos protetores"]'::jsonb, '["Registrar pressão","Revisar medicações com profissional quando indicado","Acompanhar exames e retornos"]'::jsonb),
  ('diabetes', 'Diabetes', 'Coordenação de rotina, exames, medicações e hábitos relacionados ao diabetes.', 'Pessoas com diabetes ou acompanhamento glicêmico.', '["Acompanhar exames e glicemia","Apoiar adesão ao plano assistencial","Reduzir pendências de acompanhamento"]'::jsonb, '["Revisar exames","Revisar medicações quando indicado","Manter retornos"]'::jsonb),
  ('weight', 'Peso e Metabolismo', 'Jornada longitudinal de hábitos, peso, sono e atividade.', 'Pessoas que desejam melhorar peso e saúde metabólica.', '["Acompanhar evolução de peso","Aumentar consistência de atividade","Melhorar qualidade de sono"]'::jsonb, '["Registrar peso","Revisar atividade","Revisar sono"]'::jsonb),
  ('womens-health', 'Saúde da Mulher', 'Organização preventiva, exames, vacinas, ciclos e retornos.', 'Mulheres em acompanhamento preventivo ou longitudinal.', '["Manter prevenção em dia","Organizar exames e retornos","Acompanhar objetivos pessoais"]'::jsonb, '["Revisar exames preventivos","Revisar vacinas","Planejar retorno"]'::jsonb),
  ('healthy-aging', 'Envelhecimento Saudável', 'Coordenação de prevenção, funcionalidade, vacinas, medicações e família.', 'Adultos maduros e idosos.', '["Reduzir pendências preventivas","Acompanhar funcionalidade","Apoiar segurança medicamentosa"]'::jsonb, '["Revisar vacinas","Revisar medicações","Revisar exames e retornos"]'::jsonb),
  ('mental-wellbeing', 'Bem-estar Mental', 'Acompanhamento de rotina, sono, estresse e encaminhamentos quando necessários.', 'Pessoas que desejam acompanhamento de bem-estar emocional.', '["Acompanhar sono e estresse","Criar rotina de autocuidado","Facilitar acesso à ajuda adequada"]'::jsonb, '["Check-in de bem-estar","Revisar sono","Definir próximo passo"]'::jsonb),
  ('pregnancy', 'Gestação', 'Organização de consultas, exames, documentos e acompanhamento da jornada gestacional.', 'Gestantes e famílias.', '["Manter pré-natal organizado","Reduzir exames e retornos pendentes","Centralizar documentos"]'::jsonb, '["Revisar agenda de pré-natal","Organizar exames","Revisar orientações da equipe"]'::jsonb),
  ('family-health', 'Saúde da Família', 'Coordenação preventiva para diferentes membros da família.', 'Famílias que desejam acompanhar saúde de forma organizada.', '["Centralizar pendências da família","Acompanhar vacinas e retornos","Facilitar navegação em saúde"]'::jsonb, '["Revisar membros","Revisar vacinas","Revisar exames e retornos"]'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  target = EXCLUDED.target,
  default_goals = EXCLUDED.default_goals,
  default_checklist = EXCLUDED.default_checklist,
  active = true,
  updated_at = NOW();

-- -----------------------------------------------------
-- 14) Realtime for request/action updates (optional)
-- -----------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.concierge_requests;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.concierge_actions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.concierge_alerts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- -----------------------------------------------------
-- PILOT SETUP (manual, after migration)
-- Add staff explicitly; never infer staff role from profile text.
--
-- INSERT INTO public.concierge_staff (user_id, role, display_name)
-- VALUES ('<AUTH_USER_UUID>', 'nurse', 'Nome da enfermeira');
-- -----------------------------------------------------
