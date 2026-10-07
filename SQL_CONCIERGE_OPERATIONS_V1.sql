-- ============================================================
-- HEALTHWALLET / MYDATAMED CONCIERGE OPERATIONS V1
-- Operational navigation engine for insurance, reimbursement,
-- authorization, scheduling, hospitalization and complex cases.
-- Apply only after Concierge Digital AI V1.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

-- ------------------------------------------------------------
-- 1) Regulatory / operational playbooks
-- These are operational references, not autonomous legal advice.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_regulatory_playbooks (
  rule_code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authority TEXT NOT NULL,
  source_url TEXT NOT NULL,
  version_label TEXT,
  effective_from DATE,
  reviewed_at TIMESTAMPTZ,
  service_type TEXT NOT NULL,
  max_business_days INTEGER,
  escalation_action TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2) Operational cases
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_operational_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_family_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  request_id UUID REFERENCES public.concierge_requests(id) ON DELETE SET NULL,
  chat_session_id UUID REFERENCES public.concierge_chat_sessions(id) ON DELETE SET NULL,

  case_type TEXT NOT NULL CHECK (case_type IN (
    'provider_search',
    'scheduling',
    'insurance_authorization',
    'reimbursement',
    'claim_denial',
    'hospitalization',
    'surgery',
    'complex_case',
    'caregiver_coordination',
    'general_navigation',
    'other'
  )),
  title TEXT NOT NULL,
  description TEXT,

  insurer_name TEXT,
  plan_name TEXT,
  protocol_number TEXT,
  protocol_opened_at TIMESTAMPTZ,

  regulatory_rule_code TEXT REFERENCES public.concierge_regulatory_playbooks(rule_code) ON DELETE SET NULL,
  regulatory_deadline_at TIMESTAMPTZ,
  deadline_confirmed BOOLEAN NOT NULL DEFAULT false,
  next_followup_at TIMESTAMPTZ,

  amount_requested NUMERIC(14,2),
  amount_reimbursed NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'BRL',

  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN (
      'new',
      'collecting_docs',
      'ready_to_contact',
      'contacting_operator',
      'waiting_operator',
      'action_required_patient',
      'escalated_ans',
      'waiting_ans',
      'scheduled',
      'authorized',
      'reimbursed',
      'resolved',
      'closed',
      'cancelled'
    )),

  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome TEXT,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 3) Administrative documents / DocWallet references
-- No bearer signing link or raw evidence is stored here.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_case_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.concierge_operational_cases(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  document_type TEXT NOT NULL CHECK (document_type IN (
    'medical_order',
    'medical_report',
    'insurance_card',
    'receipt_invoice',
    'proof_of_payment',
    'authorization',
    'denial',
    'reimbursement_form',
    'service_terms',
    'privacy_consent',
    'representation_authorization',
    'combined_onboarding',
    'other'
  )),
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','received','under_review','signature_pending','signed','rejected','archived')),

  docwallet_document_id TEXT,
  docwallet_signature_request_id TEXT,
  content_hash TEXT,
  final_hash TEXT,

  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 4) Case timeline
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.concierge_operational_cases(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL DEFAULT 'system',
  event_type TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'patient'
    CHECK (visibility IN ('patient','staff_only')),
  message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concierge_ops_patient_status
  ON public.concierge_operational_cases(patient_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_concierge_ops_staff_queue
  ON public.concierge_operational_cases(status, priority, next_followup_at, regulatory_deadline_at);
CREATE INDEX IF NOT EXISTS idx_concierge_ops_request
  ON public.concierge_operational_cases(request_id);
CREATE INDEX IF NOT EXISTS idx_concierge_ops_chat
  ON public.concierge_operational_cases(chat_session_id);
CREATE INDEX IF NOT EXISTS idx_concierge_case_documents_case
  ON public.concierge_case_documents(case_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concierge_case_events_case
  ON public.concierge_case_events(case_id, created_at ASC);

-- ------------------------------------------------------------
-- 5) Staff authorization, shared with MyDataMed roles
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.concierge_operations_staff_role(p_user UUID)
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

CREATE OR REPLACE FUNCTION private.concierge_operations_is_staff(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.concierge_operations_staff_role(p_user) IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION private.concierge_operations_staff_role(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.concierge_operations_is_staff(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.concierge_operations_staff_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.concierge_operations_is_staff(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 6) RLS
-- ------------------------------------------------------------
ALTER TABLE public.concierge_regulatory_playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_operational_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_case_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_case_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS concierge_playbooks_read ON public.concierge_regulatory_playbooks;
CREATE POLICY concierge_playbooks_read
ON public.concierge_regulatory_playbooks
FOR SELECT TO authenticated
USING (active = true OR private.concierge_operations_is_staff(auth.uid()));

DROP POLICY IF EXISTS concierge_playbooks_staff_manage ON public.concierge_regulatory_playbooks;
CREATE POLICY concierge_playbooks_staff_manage
ON public.concierge_regulatory_playbooks
FOR ALL TO authenticated
USING (private.concierge_operations_is_staff(auth.uid()))
WITH CHECK (private.concierge_operations_is_staff(auth.uid()));

DROP POLICY IF EXISTS concierge_ops_patient_read ON public.concierge_operational_cases;
CREATE POLICY concierge_ops_patient_read
ON public.concierge_operational_cases
FOR SELECT TO authenticated
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS concierge_ops_staff_read ON public.concierge_operational_cases;
CREATE POLICY concierge_ops_staff_read
ON public.concierge_operational_cases
FOR SELECT TO authenticated
USING (private.concierge_operations_is_staff(auth.uid()));

DROP POLICY IF EXISTS concierge_ops_staff_insert ON public.concierge_operational_cases;
CREATE POLICY concierge_ops_staff_insert
ON public.concierge_operational_cases
FOR INSERT TO authenticated
WITH CHECK (private.concierge_operations_is_staff(auth.uid()));

DROP POLICY IF EXISTS concierge_ops_staff_update ON public.concierge_operational_cases;
CREATE POLICY concierge_ops_staff_update
ON public.concierge_operational_cases
FOR UPDATE TO authenticated
USING (private.concierge_operations_is_staff(auth.uid()))
WITH CHECK (private.concierge_operations_is_staff(auth.uid()));

DROP POLICY IF EXISTS concierge_docs_patient_read ON public.concierge_case_documents;
CREATE POLICY concierge_docs_patient_read
ON public.concierge_case_documents
FOR SELECT TO authenticated
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS concierge_docs_staff_manage ON public.concierge_case_documents;
CREATE POLICY concierge_docs_staff_manage
ON public.concierge_case_documents
FOR ALL TO authenticated
USING (private.concierge_operations_is_staff(auth.uid()))
WITH CHECK (private.concierge_operations_is_staff(auth.uid()));

DROP POLICY IF EXISTS concierge_case_events_patient_read ON public.concierge_case_events;
CREATE POLICY concierge_case_events_patient_read
ON public.concierge_case_events
FOR SELECT TO authenticated
USING (patient_id = auth.uid() AND visibility = 'patient');

DROP POLICY IF EXISTS concierge_case_events_staff_read ON public.concierge_case_events;
CREATE POLICY concierge_case_events_staff_read
ON public.concierge_case_events
FOR SELECT TO authenticated
USING (private.concierge_operations_is_staff(auth.uid()));

DROP POLICY IF EXISTS concierge_case_events_staff_insert ON public.concierge_case_events;
CREATE POLICY concierge_case_events_staff_insert
ON public.concierge_case_events
FOR INSERT TO authenticated
WITH CHECK (
  private.concierge_operations_is_staff(auth.uid())
  AND actor_user_id = auth.uid()
);

GRANT SELECT ON public.concierge_regulatory_playbooks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.concierge_operational_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.concierge_case_documents TO authenticated;
GRANT SELECT, INSERT ON public.concierge_case_events TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.concierge_regulatory_playbooks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concierge_operational_cases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concierge_case_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concierge_case_events TO service_role;

-- ------------------------------------------------------------
-- 7) updated_at
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_concierge_operations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concierge_operational_cases_updated_at ON public.concierge_operational_cases;
CREATE TRIGGER trg_concierge_operational_cases_updated_at
BEFORE UPDATE ON public.concierge_operational_cases
FOR EACH ROW EXECUTE FUNCTION public.set_concierge_operations_updated_at();

DROP TRIGGER IF EXISTS trg_concierge_case_documents_updated_at ON public.concierge_case_documents;
CREATE TRIGGER trg_concierge_case_documents_updated_at
BEFORE UPDATE ON public.concierge_case_documents
FOR EACH ROW EXECUTE FUNCTION public.set_concierge_operations_updated_at();

DROP TRIGGER IF EXISTS trg_concierge_regulatory_playbooks_updated_at ON public.concierge_regulatory_playbooks;
CREATE TRIGGER trg_concierge_regulatory_playbooks_updated_at
BEFORE UPDATE ON public.concierge_regulatory_playbooks
FOR EACH ROW EXECUTE FUNCTION public.set_concierge_operations_updated_at();

-- ------------------------------------------------------------
-- 8) Current operational playbooks verified against ANS pages
-- reviewed 2026-10-07. Keep versioned and review periodically.
-- ------------------------------------------------------------
INSERT INTO public.concierge_regulatory_playbooks (
  rule_code, title, authority, source_url, version_label, effective_from,
  reviewed_at, service_type, max_business_days, escalation_action, metadata
)
VALUES
  (
    'ANS_RN566_BASIC_CONSULT',
    'Consulta básica - prazo máximo de atendimento',
    'ANS',
    'https://www.gov.br/ans/pt-br/assuntos/consumidor/prazos-maximos-de-atendimento',
    'RN 566/2022 - página ANS atualizada em 28/07/2026',
    '2022-12-30',
    NOW(),
    'basic_consultation',
    7,
    'Registrar protocolo na operadora e, se não solucionado, avaliar reclamação/NIP na ANS.',
    '{"deadline_unit":"business_days","operator_must_confirm_holidays":true}'::jsonb
  ),
  (
    'ANS_RN566_SPECIALIST',
    'Demais especialidades médicas - prazo máximo de atendimento',
    'ANS',
    'https://www.gov.br/ans/pt-br/assuntos/consumidor/prazos-maximos-de-atendimento',
    'RN 566/2022 - página ANS atualizada em 28/07/2026',
    '2022-12-30',
    NOW(),
    'specialist_consultation',
    14,
    'Registrar protocolo na operadora e, se não solucionado, avaliar reclamação/NIP na ANS.',
    '{"deadline_unit":"business_days","operator_must_confirm_holidays":true}'::jsonb
  ),
  (
    'ANS_RN566_HIGH_COMPLEXITY',
    'Procedimentos de alta complexidade - prazo máximo de atendimento',
    'ANS',
    'https://www.gov.br/ans/pt-br/assuntos/consumidor/prazos-maximos-de-atendimento',
    'RN 566/2022 - página ANS atualizada em 28/07/2026',
    '2022-12-30',
    NOW(),
    'high_complexity_procedure',
    21,
    'Registrar protocolo na operadora e, se não solucionado, avaliar reclamação/NIP na ANS.',
    '{"deadline_unit":"business_days","operator_must_confirm_holidays":true}'::jsonb
  ),
  (
    'ANS_NIP_ASSISTENCIAL',
    'NIP assistencial - prazo de resposta ao consumidor',
    'ANS',
    'https://www.gov.br/ans/pt-br/assuntos/consumidor/notificacao-de-intermediacao-preliminar-nip',
    'Fluxo NIP - página ANS atualizada em 17/09/2026',
    '2026-05-01',
    NOW(),
    'nip_assistential',
    5,
    'Acompanhar resposta da operadora e registrar se a demanda foi solucionada.',
    '{"deadline_unit":"business_days","operator_must_confirm_holidays":true}'::jsonb
  ),
  (
    'ANS_NIP_NAO_ASSISTENCIAL',
    'NIP não assistencial - prazo de resposta ao consumidor',
    'ANS',
    'https://www.gov.br/ans/pt-br/assuntos/consumidor/notificacao-de-intermediacao-preliminar-nip',
    'Fluxo NIP - página ANS atualizada em 17/09/2026',
    '2026-05-01',
    NOW(),
    'nip_non_assistential',
    10,
    'Acompanhar resposta da operadora e registrar se a demanda foi solucionada.',
    '{"deadline_unit":"business_days","operator_must_confirm_holidays":true}'::jsonb
  )
ON CONFLICT (rule_code) DO UPDATE SET
  title = EXCLUDED.title,
  authority = EXCLUDED.authority,
  source_url = EXCLUDED.source_url,
  version_label = EXCLUDED.version_label,
  reviewed_at = EXCLUDED.reviewed_at,
  service_type = EXCLUDED.service_type,
  max_business_days = EXCLUDED.max_business_days,
  escalation_action = EXCLUDED.escalation_action,
  metadata = EXCLUDED.metadata,
  active = true,
  updated_at = NOW();

-- ------------------------------------------------------------
-- 9) Realtime
-- ------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.concierge_operational_cases;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.concierge_case_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
