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
CREATE UNIQUE INDEX IF NOT EXISTS uq_concierge_case_documents_type
  ON public.concierge_case_documents(case_id, document_type)
  WHERE document_type IN ('service_terms','privacy_consent','representation_authorization','combined_onboarding');
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
-- 8B) Legal / regulatory quick guides for patient + staff
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_regulatory_guides (
  guide_code TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  question TEXT NOT NULL,
  patient_answer TEXT NOT NULL,
  staff_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  escalation_path JSONB NOT NULL DEFAULT '[]'::jsonb,
  legal_boundary TEXT,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.concierge_regulatory_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS concierge_reg_guides_read ON public.concierge_regulatory_guides;
CREATE POLICY concierge_reg_guides_read
ON public.concierge_regulatory_guides
FOR SELECT TO authenticated
USING (active = true OR private.concierge_operations_is_staff(auth.uid()));

DROP POLICY IF EXISTS concierge_reg_guides_staff_manage ON public.concierge_regulatory_guides;
CREATE POLICY concierge_reg_guides_staff_manage
ON public.concierge_regulatory_guides
FOR ALL TO authenticated
USING (private.concierge_operations_is_staff(auth.uid()))
WITH CHECK (private.concierge_operations_is_staff(auth.uid()));

GRANT SELECT ON public.concierge_regulatory_guides TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concierge_regulatory_guides TO service_role;

INSERT INTO public.concierge_regulatory_guides (
  guide_code, topic, question, patient_answer, staff_checklist,
  required_documents, escalation_path, legal_boundary, source_refs, reviewed_at, metadata
)
VALUES
(
  'WAITING_TIME_RN566',
  'Prazos máximos de atendimento',
  'O plano pode me dar consulta ou exame só para daqui a muitos dias?',
  'A ANS estabelece prazos máximos de garantia de atendimento após as carências, conforme o tipo de serviço e a cobertura contratada. Exemplos: consulta básica em até 7 dias úteis; demais especialidades em 14; análises clínicas em 3; demais diagnósticos/terapias ambulatoriais em 10; procedimentos de alta complexidade em 21; internação eletiva em 21; hospital-dia em 10. Se a rede não oferecer atendimento no prazo, o passo correto é primeiro acionar a operadora e exigir uma alternativa dentro das regras de garantia de atendimento.',
  '[
    "Confirmar segmentação, abrangência geográfica e carência do plano.",
    "Registrar protocolo na operadora antes de orientar atendimento particular eletivo.",
    "Classificar corretamente o serviço e consultar o playbook RN 566 aplicável.",
    "Pedir alternativa de prestador dentro do prazo regulamentar.",
    "Registrar resposta, prestador indicado e data ofertada.",
    "Se a operadora não garantir atendimento, avaliar escalonamento para Ouvidoria/NIP.",
    "Se houve pagamento particular por falha comprovada da garantia de atendimento, abrir fluxo de reembolso integral."
  ]'::jsonb,
  '["carteirinha/plano","pedido médico quando aplicável","protocolo da operadora","data ofertada pela rede","comprovante de tentativa/agendamento"]'::jsonb,
  '["Operadora/SAC","Ouvidoria da operadora","NIP ANS","advogado parceiro se houver necessidade judicial"]'::jsonb,
  'O Concierge informa regras e executa atos administrativos. Não oferece parecer jurídico individualizado nem promete resultado. Em urgência/emergência, não se aguarda rito administrativo.',
  '[
    {"authority":"ANS","rule":"RN 566/2022","url":"https://www.gov.br/ans/pt-br/assuntos/consumidor/prazos-maximos-de-atendimento","reviewed":"2026-10-07"}
  ]'::jsonb,
  NOW(),
  '{"patient_safe":true,"staff_actionable":true}'::jsonb
),
(
  'AUTHORIZATION_RN623',
  'Autorização e negativa',
  'Quanto tempo o plano pode levar para responder uma autorização e o que fazer se negar?',
  'Pelas regras atuais de atendimento da ANS, solicitações assistenciais devem receber resposta imediata quando possível; se não for possível, em regra até 5 dias úteis. Para procedimentos de alta complexidade ou internação eletiva, a resposta pode ocorrer em até 10 dias úteis, sem alterar o prazo máximo para a efetiva realização do atendimento. Urgência e emergência exigem resposta imediata. A negativa deve ser formalizada de modo claro, com o motivo e a base contratual ou normativa, e o beneficiário pode pedir reanálise pela Ouvidoria.',
  '[
    "Obter protocolo logo no início do atendimento.",
    "Confirmar se o pedido é urgência/emergência, PAC/internação eletiva ou demais casos.",
    "Checar se a operadora pediu complemento documental e se a exigência está descrita objetivamente.",
    "Solicitar/baixar a negativa formal com motivo e base contratual/normativa.",
    "Oferecer reanálise na Ouvidoria quando cabível.",
    "Se persistir e houver cobertura regulatória/contratual, avaliar NIP.",
    "Se houver controvérsia jurídica complexa ou necessidade de liminar, encaminhar a advogado."
  ]'::jsonb,
  '["pedido médico","laudo/relatório quando houver","documentos exigidos pela operadora","protocolo","negativa formal"]'::jsonb,
  '["Operadora/SAC","Ouvidoria/reanálise","NIP ANS","advogado parceiro"]'::jsonb,
  'A equipe administrativa não altera indicação clínica nem redige justificativa médica em nome do profissional. Pode verificar completude formal e pedir ao profissional assistente que complemente o documento.',
  '[
    {"authority":"ANS","rule":"RN 623/2024","url":"https://bvsms.saude.gov.br/bvs/saudelegis/ans/2024/res0623_19_12_2024.html","reviewed":"2026-10-07"}
  ]'::jsonb,
  NOW(),
  '{"patient_safe":true,"staff_actionable":true}'::jsonb
),
(
  'OUTSIDE_ROL_L14454',
  'Procedimento fora do Rol',
  'Se o tratamento não está no Rol da ANS, o plano pode negar automaticamente?',
  'Não é correto tratar toda solicitação fora do Rol como automaticamente excluída. A Lei 14.454/2022 prevê critérios para cobertura de tratamento ou procedimento prescrito fora do Rol: comprovação de eficácia baseada em evidências científicas e plano terapêutico, ou recomendação da Conitec ou de órgão internacional de avaliação de tecnologias em saúde de renome, nos termos da lei. Cada caso exige análise da indicação, contrato e documentação.',
  '[
    "Obter prescrição e relatório do profissional assistente.",
    "Não prometer cobertura automática.",
    "Checar se há evidência científica/plano terapêutico ou recomendação prevista na Lei 14.454/2022.",
    "Protocolar pedido e guardar negativa formal.",
    "Solicitar reanálise/Ouvidoria quando houver fundamento.",
    "Escalar à NIP em matéria administrativa regulatória adequada.",
    "Encaminhar a advogado quando houver controvérsia jurídica relevante ou necessidade judicial."
  ]'::jsonb,
  '["prescrição","relatório médico/odontológico","plano terapêutico quando aplicável","negativa formal","protocolo"]'::jsonb,
  '["Operadora","Ouvidoria","NIP ANS quando aplicável","advogado parceiro"]'::jsonb,
  'O Concierge não conclui sozinho que uma tecnologia fora do Rol deve ser coberta. A IA não faz avaliação clínica de eficácia nem substitui médico ou advogado.',
  '[
    {"authority":"Planalto","rule":"Lei 14.454/2022","url":"https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/l14454.htm","reviewed":"2026-10-07"}
  ]'::jsonb,
  NOW(),
  '{"patient_safe":true,"staff_actionable":true}'::jsonb
),
(
  'REIMBURSEMENT_RULES',
  'Reembolso',
  'Quanto o plano deve reembolsar e em quanto tempo?',
  'O valor depende da modalidade contratual e da situação. Em planos com livre escolha, valem os critérios e limites contratuais, com dever de transparência sobre o cálculo. Já quando a operadora não garante atendimento pela rede nos termos da regulamentação e o beneficiário, após acionar a operadora, precisa pagar pelo atendimento, pode haver direito a reembolso integral, inclusive transporte quando devido, conforme as regras da ANS. Não se deve prometer reembolso integral sem verificar o fluxo e os documentos do caso.',
  '[
    "Identificar se o contrato tem livre escolha/reembolso.",
    "Confirmar se houve contato prévio com a operadora quando se trata de falha da rede em atendimento eletivo.",
    "Coletar documento fiscal/recibo e comprovante de pagamento.",
    "Solicitar a memória/tabela/fórmula de cálculo quando for reembolso contratual.",
    "Registrar data de protocolo e documentação entregue.",
    "Comparar valor pago/reembolsado e motivo de eventual diferença.",
    "Se houver falha na garantia de atendimento, aplicar playbook de reembolso integral conforme RN 566.",
    "Escalar divergências administrativas para Ouvidoria/NIP; controvérsia jurídica para advogado."
  ]'::jsonb,
  '["nota fiscal ou recibo","comprovante de pagamento","pedido/relatório quando exigido","protocolo","contrato/tabela de reembolso quando disponível"]'::jsonb,
  '["Operadora/SAC","Ouvidoria","NIP ANS","advogado parceiro"]'::jsonb,
  'Não afirmar que todo gasto particular gera reembolso. Em atendimento eletivo por falha de rede, o contato prévio com a operadora é elemento crítico do fluxo regulatório. Urgência/emergência possui regras próprias.',
  '[
    {"authority":"ANS","rule":"Reembolso - orientação ao consumidor","url":"https://www.gov.br/ans/pt-br/assuntos/consumidor/o-que-o-seu-plano-de-saude-deve-cobrir-1/reembolso","reviewed":"2026-10-07"},
    {"authority":"ANS","rule":"RN 566/2022 art. 10","url":"https://bvsms.saude.gov.br/bvs/saudelegis/ans/2023/res0566_02_01_2023.html","reviewed":"2026-10-07"}
  ]'::jsonb,
  NOW(),
  '{"patient_safe":true,"staff_actionable":true}'::jsonb
),
(
  'THERAPY_TGD_RN539_RN541',
  'Terapias e neurodesenvolvimento',
  'O plano pode limitar sessões de fono, psicologia, terapia ocupacional ou fisioterapia?',
  'Desde 2022, a ANS eliminou limites de cobertura de sessões com psicólogos, fonoaudiólogos, terapeutas ocupacionais e fisioterapeutas para planos regulamentados com a cobertura pertinente, considerando a indicação do profissional assistente. Para transtornos globais do desenvolvimento, incluindo TEA, a RN 539/2022 também ampliou a cobertura de métodos e técnicas indicados pelo profissional assistente. A elegibilidade concreta depende do plano, cobertura, carências e indicação assistencial.',
  '[
    "Confirmar se o plano é regulamentado/adaptado e possui cobertura ambulatorial pertinente.",
    "Obter prescrição/relatório e frequência indicada pelo profissional assistente.",
    "Não modificar frequência, método ou justificativa clínica.",
    "Protocolar pedido e guardar eventual limitação/negativa formal.",
    "Solicitar reanálise/Ouvidoria quando a restrição contrariar a cobertura aplicável.",
    "Escalar para NIP se não resolvido administrativamente."
  ]'::jsonb,
  '["prescrição","relatório assistencial","plano terapêutico quando houver","protocolo","negativa/limitação formal"]'::jsonb,
  '["Operadora","Ouvidoria","NIP ANS","advogado parceiro quando necessário"]'::jsonb,
  'Não confundir TEA com TDAH nem prometer cobertura de qualquer técnica em qualquer hipótese. A RN 539 trata TGD/TEA; a RN 541 eliminou limites de sessões das quatro categorias para planos regulamentados conforme cobertura e indicação.',
  '[
    {"authority":"ANS","rule":"RN 539/2022","url":"https://www.gov.br/ans/pt-br/assuntos/noticias/periodo-eleitoral/ans-amplia-regras-de-cobertura-para-tratamento-de-transtornos-globais-do-desenvolvimento","reviewed":"2026-10-07"},
    {"authority":"ANS","rule":"RN 541/2022","url":"https://www.gov.br/ans/pt-br/assuntos/noticias/periodo-eleitoral/entra-em-vigor-o-fim-dos-limites-de-cobertura-de-quatro-categorias-profissionais","reviewed":"2026-10-07"}
  ]'::jsonb,
  NOW(),
  '{"patient_safe":true,"staff_actionable":true}'::jsonb
),
(
  'NIP_FLOW_2026',
  'NIP ANS',
  'Quando e como abrir uma reclamação/NIP na ANS?',
  'A NIP é o mecanismo de intermediação da ANS. O fluxo começa com reclamação prévia à operadora e registro do protocolo. Se o problema não for solucionado, a reclamação pode ser registrada na ANS. Em 2026, a operadora tem até 5 dias úteis para analisar demandas assistenciais e 10 dias úteis para não assistenciais; há também prazo de 10 dias úteis para resposta à ANS. Depois, o consumidor informa se o problema foi resolvido.',
  '[
    "Confirmar que houve contato prévio com a operadora e guardar o protocolo.",
    "Classificar como assistencial ou não assistencial.",
    "Organizar narrativa factual curta, pedido concreto e documentos.",
    "Registrar a reclamação nos canais oficiais da ANS em nome do cliente somente se houver autorização/procuração adequada.",
    "Guardar número da demanda NIP e data.",
    "Programar follow-up em 5 dias úteis (assistencial) ou 10 dias úteis (não assistencial).",
    "Acompanhar retorno e registrar se houve solução.",
    "Se não resolvido, avaliar novo passo administrativo ou encaminhamento jurídico."
  ]'::jsonb,
  '["protocolo prévio da operadora","carteirinha/plano","documentos da demanda","negativa ou resposta da operadora quando houver","procuração/autorização se o Concierge atuar em nome do cliente"]'::jsonb,
  '["Operadora","ANS/NIP","advogado parceiro quando necessária tutela judicial"]'::jsonb,
  'Não prometer resolução em 48 horas. A ANS informa prazos de análise de 5 ou 10 dias úteis conforme a natureza da demanda. O Concierge acompanha administrativamente; não representa o cliente em processo judicial.',
  '[
    {"authority":"ANS","rule":"Fluxo NIP 2026","url":"https://www.gov.br/ans/pt-br/assuntos/consumidor/notificacao-de-intermediacao-preliminar-nip","reviewed":"2026-10-07"}
  ]'::jsonb,
  NOW(),
  '{"patient_safe":true,"staff_actionable":true}'::jsonb
),
(
  'CONCIERGE_BOUNDARIES',
  'Limites de atuação',
  'O que o Concierge pode fazer e quando precisa de médico ou advogado?',
  'O Concierge atua na coordenação administrativa: organiza documentos, protocolos, prazos, contatos com operadora, reembolso, autorizações e reclamações administrativas autorizadas pelo cliente. Ele não diagnostica, prescreve ou altera conduta médica. Também não presta representação judicial; quando uma controvérsia exige estratégia jurídica individualizada, ação judicial ou liminar, o caso deve ser encaminhado a advogado habilitado.',
  '[
    "Separar tarefa administrativa de decisão clínica e jurídica.",
    "Nunca alterar pedido/laudo médico; apenas apontar falta formal e solicitar complementação ao profissional.",
    "Nunca assinar ou declarar em nome do cliente sem autorização válida.",
    "Usar procuração/autorização DocWallet quando houver atuação em nome do cliente.",
    "Escalar decisão clínica para profissional de saúde habilitado.",
    "Escalar judicialização/parecer jurídico individualizado para advogado."
  ]'::jsonb,
  '["termo LGPD/privacidade","termo de serviço","procuração/autorização quando necessário"]'::jsonb,
  '["Concierge administrativo","enfermagem/médico","advogado parceiro"]'::jsonb,
  'As informações regulatórias do produto são educativas e operacionais; não substituem consulta jurídica individualizada.',
  '[
    {"authority":"ANS","rule":"RN 623/2024 - atendimento e rastreabilidade","url":"https://bvsms.saude.gov.br/bvs/saudelegis/ans/2024/res0623_19_12_2024.html","reviewed":"2026-10-07"},
    {"authority":"Planalto","rule":"Lei 8.906/1994 art. 1 - atividade privativa de advocacia","url":"https://www.planalto.gov.br/ccivil_03/leis/l8906.htm","reviewed":"2026-10-07"},
    {"authority":"Planalto","rule":"Lei 12.842/2013 - exercício da Medicina","url":"https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/lei/l12842.htm","reviewed":"2026-10-07"}
  ]'::jsonb,
  NOW(),
  '{"patient_safe":true,"staff_actionable":true}'::jsonb
)
ON CONFLICT (guide_code) DO UPDATE SET
  topic = EXCLUDED.topic,
  question = EXCLUDED.question,
  patient_answer = EXCLUDED.patient_answer,
  staff_checklist = EXCLUDED.staff_checklist,
  required_documents = EXCLUDED.required_documents,
  escalation_path = EXCLUDED.escalation_path,
  legal_boundary = EXCLUDED.legal_boundary,
  source_refs = EXCLUDED.source_refs,
  reviewed_at = EXCLUDED.reviewed_at,
  active = true,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();


-- ------------------------------------------------------------
-- 8C) Business-day calendar and deadline computation
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_business_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL,
  scope TEXT NOT NULL DEFAULT 'national' CHECK (scope IN ('national','state','city')),
  state_code TEXT,
  city_name TEXT,
  label TEXT NOT NULL,
  source_url TEXT,
  reviewed_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_concierge_business_holidays_scope
ON public.concierge_business_holidays (
  holiday_date,
  scope,
  COALESCE(state_code, ''),
  COALESCE(city_name, '')
);

ALTER TABLE public.concierge_business_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS concierge_holidays_read ON public.concierge_business_holidays;
CREATE POLICY concierge_holidays_read
ON public.concierge_business_holidays
FOR SELECT TO authenticated
USING (active = true);

DROP POLICY IF EXISTS concierge_holidays_staff_manage ON public.concierge_business_holidays;
CREATE POLICY concierge_holidays_staff_manage
ON public.concierge_business_holidays
FOR ALL TO authenticated
USING (private.concierge_operations_is_staff(auth.uid()))
WITH CHECK (private.concierge_operations_is_staff(auth.uid()));

GRANT SELECT ON public.concierge_business_holidays TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concierge_business_holidays TO service_role;

CREATE OR REPLACE FUNCTION public.concierge_compute_business_deadline(
  p_start_date DATE,
  p_business_days INTEGER,
  p_state_code TEXT DEFAULT NULL,
  p_city_name TEXT DEFAULT NULL
)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  cursor_date DATE := p_start_date;
  remaining INTEGER := GREATEST(COALESCE(p_business_days, 0), 0);
  is_holiday BOOLEAN;
BEGIN
  IF p_start_date IS NULL OR remaining = 0 THEN
    RETURN p_start_date;
  END IF;

  WHILE remaining > 0 LOOP
    cursor_date := cursor_date + INTERVAL '1 day';

    IF EXTRACT(ISODOW FROM cursor_date) IN (6, 7) THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.concierge_business_holidays h
      WHERE h.holiday_date = cursor_date
        AND h.active = true
        AND (
          h.scope = 'national'
          OR (h.scope = 'state' AND p_state_code IS NOT NULL AND UPPER(h.state_code) = UPPER(p_state_code))
          OR (h.scope = 'city' AND p_city_name IS NOT NULL AND LOWER(h.city_name) = LOWER(p_city_name))
        )
    )
    INTO is_holiday;

    IF NOT is_holiday THEN
      remaining := remaining - 1;
    END IF;
  END LOOP;

  RETURN cursor_date;
END;
$$;

REVOKE ALL ON FUNCTION public.concierge_compute_business_deadline(DATE, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concierge_compute_business_deadline(DATE, INTEGER, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 8D) Full ANS deadline catalog used by the operational engine
-- ------------------------------------------------------------
INSERT INTO public.concierge_regulatory_playbooks (
  rule_code, title, authority, source_url, version_label, effective_from,
  reviewed_at, service_type, max_business_days, escalation_action, metadata
)
VALUES
  ('ANS_RN566_LAB_ANALYSIS','Análises clínicas - prazo máximo de atendimento','ANS',
   'https://www.gov.br/ans/pt-br/assuntos/consumidor/prazos-maximos-de-atendimento',
   'RN 566/2022 - página ANS consultada em 07/10/2026','2022-12-30',NOW(),
   'laboratory_analysis',3,
   'Registrar protocolo e exigir alternativa de atendimento se a rede não garantir o serviço no prazo.',
   '{"deadline_kind":"service_delivery","deadline_unit":"business_days"}'::jsonb),
  ('ANS_RN566_OTHER_DIAGNOSTIC','Demais diagnósticos/terapias ambulatoriais - prazo máximo','ANS',
   'https://www.gov.br/ans/pt-br/assuntos/consumidor/prazos-maximos-de-atendimento',
   'RN 566/2022 - página ANS consultada em 07/10/2026','2022-12-30',NOW(),
   'other_diagnostic_therapy',10,
   'Registrar protocolo e exigir alternativa de atendimento se a rede não garantir o serviço no prazo.',
   '{"deadline_kind":"service_delivery","deadline_unit":"business_days"}'::jsonb),
  ('ANS_RN566_THERAPY_SESSION','Sessões com psicologia/fono/TO/fisioterapia/nutrição - prazo máximo','ANS',
   'https://www.gov.br/ans/pt-br/assuntos/consumidor/prazos-maximos-de-atendimento',
   'RN 566/2022 - página ANS consultada em 07/10/2026','2022-12-30',NOW(),
   'therapy_session',10,
   'Registrar protocolo e exigir garantia do atendimento dentro do prazo.',
   '{"deadline_kind":"service_delivery","deadline_unit":"business_days"}'::jsonb),
  ('ANS_RN566_ELECTIVE_HOSPITALIZATION','Internação eletiva - prazo máximo de atendimento','ANS',
   'https://www.gov.br/ans/pt-br/assuntos/consumidor/prazos-maximos-de-atendimento',
   'RN 566/2022 - página ANS consultada em 07/10/2026','2022-12-30',NOW(),
   'elective_hospitalization',21,
   'Registrar protocolo e acompanhar a garantia da internação; escalar administrativamente se o prazo não for cumprido.',
   '{"deadline_kind":"service_delivery","deadline_unit":"business_days"}'::jsonb),
  ('ANS_RN566_DAY_HOSPITAL','Hospital-dia - prazo máximo de atendimento','ANS',
   'https://www.gov.br/ans/pt-br/assuntos/consumidor/prazos-maximos-de-atendimento',
   'RN 566/2022 - página ANS consultada em 07/10/2026','2022-12-30',NOW(),
   'day_hospital',10,
   'Registrar protocolo e acompanhar a garantia do atendimento.',
   '{"deadline_kind":"service_delivery","deadline_unit":"business_days"}'::jsonb),
  ('ANS_RN623_ASSISTENTIAL_RESPONSE','Resposta a solicitação assistencial - regra geral','ANS',
   'https://www.gov.br/ans/pt-br/assuntos/operadoras/atendimento-ao-beneficiario-diretrizes-da-rn-no-623-2024-para-operadoras',
   'RN 623/2024 - vigente desde 01/07/2025','2025-07-01',NOW(),
   'assistential_response',5,
   'Cobrar resposta conclusiva; prazos menores da RN 566 prevalecem quando aplicáveis.',
   '{"deadline_kind":"operator_response","deadline_unit":"business_days","does_not_replace_rn566":true}'::jsonb),
  ('ANS_RN623_PAC_ELECTIVE_RESPONSE','Resposta de autorização para PAC/internação eletiva','ANS',
   'https://www.gov.br/ans/pt-br/assuntos/operadoras/atendimento-ao-beneficiario-diretrizes-da-rn-no-623-2024-para-operadoras',
   'RN 623/2024 - vigente desde 01/07/2025','2025-07-01',NOW(),
   'pac_or_elective_authorization_response',10,
   'Cobrar resposta conclusiva; o atendimento ainda deve ocorrer dentro da RN 566.',
   '{"deadline_kind":"operator_response","deadline_unit":"business_days","does_not_replace_rn566":true}'::jsonb),
  ('ANS_RN623_NON_ASSISTENTIAL_RESPONSE','Resposta a solicitação não assistencial','ANS',
   'https://www.gov.br/ans/pt-br/assuntos/operadoras/atendimento-ao-beneficiario-diretrizes-da-rn-no-623-2024-para-operadoras',
   'RN 623/2024 - vigente desde 01/07/2025','2025-07-01',NOW(),
   'non_assistential_response',7,
   'Cobrar resposta clara e conclusiva da operadora.',
   '{"deadline_kind":"operator_response","deadline_unit":"business_days"}'::jsonb),
  ('ANS_REIMBURSEMENT_STANDARD','Reembolso - prazo geral de pagamento','ANS',
   'https://www.gov.br/ans/pt-br/assuntos/consumidor/o-que-o-seu-plano-de-saude-deve-cobrir-1/reembolso',
   'Orientação ANS atualizada em 02/06/2026','2026-06-02',NOW(),
   'reimbursement_payment',30,
   'Acompanhar documentação completa e pagamento; distinguir livre escolha, falha de rede e urgência/emergência.',
   '{"deadline_kind":"payment","calendar_basis":"verify_case","warning":"urgency_emergency_page_uses_business_days"}'::jsonb)
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
-- 8E) Omnichannel identities + secure document intake
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concierge_channel_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','sms','email')),
  external_address TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL,
  consent_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel, external_address)
);

CREATE TABLE IF NOT EXISTS public.concierge_channel_link_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel = 'whatsapp'),
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.concierge_document_intake (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.concierge_operational_cases(id) ON DELETE SET NULL,
  chat_session_id UUID REFERENCES public.concierge_chat_sessions(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('healthwallet','whatsapp','staff_upload')),
  source_message_id TEXT,
  storage_bucket TEXT NOT NULL DEFAULT 'concierge-intake',
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  original_filename TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','processing','needs_review','classified','linked','failed','archived')),
  document_type TEXT,
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  extraction_confidence NUMERIC(5,4),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_concierge_document_source_message
ON public.concierge_document_intake(channel, source_message_id)
WHERE source_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_concierge_channel_patient
ON public.concierge_channel_identities(patient_id, channel, active);

CREATE INDEX IF NOT EXISTS idx_concierge_document_intake_queue
ON public.concierge_document_intake(status, created_at DESC);

ALTER TABLE public.concierge_channel_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_channel_link_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_document_intake ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS concierge_channel_patient_read ON public.concierge_channel_identities;
CREATE POLICY concierge_channel_patient_read
ON public.concierge_channel_identities FOR SELECT TO authenticated
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS concierge_channel_staff_read ON public.concierge_channel_identities;
CREATE POLICY concierge_channel_staff_read
ON public.concierge_channel_identities FOR SELECT TO authenticated
USING (private.concierge_operations_is_staff(auth.uid()));

DROP POLICY IF EXISTS concierge_link_patient_read ON public.concierge_channel_link_challenges;
CREATE POLICY concierge_link_patient_read
ON public.concierge_channel_link_challenges FOR SELECT TO authenticated
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS concierge_intake_patient_read ON public.concierge_document_intake;
CREATE POLICY concierge_intake_patient_read
ON public.concierge_document_intake FOR SELECT TO authenticated
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS concierge_intake_staff_manage ON public.concierge_document_intake;
CREATE POLICY concierge_intake_staff_manage
ON public.concierge_document_intake FOR ALL TO authenticated
USING (private.concierge_operations_is_staff(auth.uid()))
WITH CHECK (private.concierge_operations_is_staff(auth.uid()));

GRANT SELECT ON public.concierge_channel_identities TO authenticated;
GRANT SELECT ON public.concierge_channel_link_challenges TO authenticated;
GRANT SELECT ON public.concierge_document_intake TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concierge_channel_identities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concierge_channel_link_challenges TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concierge_document_intake TO service_role;

CREATE OR REPLACE FUNCTION private.concierge_create_whatsapp_link_challenge_impl(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  plain_code TEXT;
  hashed_code TEXT;
  expires TIMESTAMPTZ := NOW() + INTERVAL '15 minutes';
BEGIN
  IF p_user_id IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'invalid caller';
  END IF;

  plain_code := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 6));
  hashed_code := encode(digest(plain_code, 'sha256'), 'hex');

  DELETE FROM public.concierge_channel_link_challenges
  WHERE patient_id = p_user_id
    AND channel = 'whatsapp'
    AND used_at IS NULL;

  INSERT INTO public.concierge_channel_link_challenges (
    patient_id, channel, code_hash, expires_at
  ) VALUES (
    p_user_id, 'whatsapp', hashed_code, expires
  );

  RETURN jsonb_build_object(
    'code', plain_code,
    'expires_at', expires
  );
END;
$$;

REVOKE ALL ON FUNCTION private.concierge_create_whatsapp_link_challenge_impl(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.concierge_create_whatsapp_link_challenge_impl(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.concierge_create_whatsapp_link_challenge()
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.concierge_create_whatsapp_link_challenge_impl(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.concierge_create_whatsapp_link_challenge() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concierge_create_whatsapp_link_challenge() TO authenticated;

-- Private storage bucket for administrative intake. Files are delivered through
-- trusted server-side flows; no public object URL is created.
INSERT INTO storage.buckets (id, name, public)
VALUES ('concierge-intake', 'concierge-intake', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- ------------------------------------------------------------
-- 8F) Operational alert engine: deadlines, follow-ups, documents
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.concierge_refresh_operational_alerts_impl()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inserted_count INTEGER := 0;
  current_count INTEGER := 0;
BEGIN
  -- Follow-up due or overdue.
  INSERT INTO public.concierge_alerts (
    patient_id, source, source_id, severity, title, explanation, suggested_action, metadata
  )
  SELECT
    c.patient_id,
    'system',
    'ops-followup:' || c.id::text,
    CASE
      WHEN c.next_followup_at < NOW() - INTERVAL '24 hours' THEN 'high'
      ELSE 'attention'
    END,
    'Caso de plano precisa de follow-up',
    format('O caso "%s" tem follow-up programado para %s.', c.title, c.next_followup_at),
    'Abrir o caso, cobrar o canal responsável e registrar novo protocolo ou próximo prazo.',
    jsonb_build_object(
      'operational_case_id', c.id,
      'case_type', c.case_type,
      'next_followup_at', c.next_followup_at,
      'generated_by', 'concierge_operations'
    )
  FROM public.concierge_operational_cases c
  WHERE c.status NOT IN ('resolved','closed','cancelled','authorized','reimbursed','scheduled')
    AND c.next_followup_at IS NOT NULL
    AND c.next_followup_at <= NOW()
    AND NOT EXISTS (
      SELECT 1 FROM public.concierge_alerts a
      WHERE a.patient_id = c.patient_id
        AND a.source = 'system'
        AND a.source_id = 'ops-followup:' || c.id::text
        AND a.status = 'open'
    );
  GET DIAGNOSTICS current_count = ROW_COUNT;
  inserted_count := inserted_count + current_count;

  -- Regulatory deadline approaching in the next business day / already due.
  INSERT INTO public.concierge_alerts (
    patient_id, source, source_id, severity, title, explanation, suggested_action, metadata
  )
  SELECT
    c.patient_id,
    'system',
    'ops-deadline:' || c.id::text,
    CASE
      WHEN c.regulatory_deadline_at <= NOW() THEN 'high'
      ELSE 'attention'
    END,
    CASE
      WHEN c.regulatory_deadline_at <= NOW() THEN 'Prazo regulatório atingido'
      ELSE 'Prazo regulatório próximo'
    END,
    format(
      'O caso "%s" possui prazo acompanhado em %s%s.',
      c.title,
      c.regulatory_deadline_at,
      CASE WHEN c.deadline_confirmed THEN ' (conferido pela equipe)' ELSE ' (estimado; confirmar feriados/localidade)' END
    ),
    'Revisar o protocolo, a resposta da operadora e aplicar o próximo passo do playbook.',
    jsonb_build_object(
      'operational_case_id', c.id,
      'case_type', c.case_type,
      'regulatory_rule_code', c.regulatory_rule_code,
      'regulatory_deadline_at', c.regulatory_deadline_at,
      'deadline_confirmed', c.deadline_confirmed,
      'generated_by', 'concierge_operations'
    )
  FROM public.concierge_operational_cases c
  WHERE c.status NOT IN ('resolved','closed','cancelled','authorized','reimbursed','scheduled')
    AND c.regulatory_deadline_at IS NOT NULL
    AND c.regulatory_deadline_at <= NOW() + INTERVAL '24 hours'
    AND NOT EXISTS (
      SELECT 1 FROM public.concierge_alerts a
      WHERE a.patient_id = c.patient_id
        AND a.source = 'system'
        AND a.source_id = 'ops-deadline:' || c.id::text
        AND a.status = 'open'
    );
  GET DIAGNOSTICS current_count = ROW_COUNT;
  inserted_count := inserted_count + current_count;

  -- Intake documents that still need human review.
  INSERT INTO public.concierge_alerts (
    patient_id, source, source_id, severity, title, explanation, suggested_action, metadata
  )
  SELECT
    d.patient_id,
    'system',
    'ops-document:' || d.id::text,
    CASE WHEN d.created_at < NOW() - INTERVAL '4 hours' THEN 'attention' ELSE 'info' END,
    'Documento do Concierge precisa de revisão',
    COALESCE(
      'Documento recebido via ' || d.channel || ': ' || d.original_filename,
      'Documento recebido pelo Concierge.'
    ),
    'Conferir a classificação/OCR, vincular ao caso correto e validar os campos antes de protocolar.',
    jsonb_build_object(
      'document_intake_id', d.id,
      'operational_case_id', d.case_id,
      'document_type', d.document_type,
      'confidence', d.extraction_confidence,
      'generated_by', 'concierge_operations'
    )
  FROM public.concierge_document_intake d
  WHERE d.status IN ('received','needs_review')
    AND NOT EXISTS (
      SELECT 1 FROM public.concierge_alerts a
      WHERE a.patient_id = d.patient_id
        AND a.source = 'system'
        AND a.source_id = 'ops-document:' || d.id::text
        AND a.status = 'open'
    );
  GET DIAGNOSTICS current_count = ROW_COUNT;
  inserted_count := inserted_count + current_count;

  -- Resolve operational alerts when their condition no longer applies.
  UPDATE public.concierge_alerts a
  SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
  WHERE a.status = 'open'
    AND a.source = 'system'
    AND (
      (
        a.source_id LIKE 'ops-followup:%'
        AND EXISTS (
          SELECT 1
          FROM public.concierge_operational_cases c
          WHERE c.id::text = replace(a.source_id, 'ops-followup:', '')
            AND (
              c.status IN ('resolved','closed','cancelled','authorized','reimbursed','scheduled')
              OR c.next_followup_at IS NULL
              OR c.next_followup_at > NOW()
            )
        )
      )
      OR (
        a.source_id LIKE 'ops-deadline:%'
        AND EXISTS (
          SELECT 1
          FROM public.concierge_operational_cases c
          WHERE c.id::text = replace(a.source_id, 'ops-deadline:', '')
            AND c.status IN ('resolved','closed','cancelled','authorized','reimbursed','scheduled')
        )
      )
      OR (
        a.source_id LIKE 'ops-document:%'
        AND EXISTS (
          SELECT 1
          FROM public.concierge_document_intake d
          WHERE d.id::text = replace(a.source_id, 'ops-document:', '')
            AND d.status NOT IN ('received','needs_review')
        )
      )
    );

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION private.concierge_refresh_operational_alerts_impl() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.concierge_refresh_operational_alerts_impl() TO authenticated;

CREATE OR REPLACE FUNCTION public.concierge_refresh_operational_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.concierge_operations_is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Concierge staff access required';
  END IF;

  RETURN private.concierge_refresh_operational_alerts_impl();
END;
$$;

REVOKE ALL ON FUNCTION public.concierge_refresh_operational_alerts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concierge_refresh_operational_alerts() TO authenticated;

CREATE OR REPLACE FUNCTION public.concierge_refresh_operational_alerts_system()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;

  RETURN private.concierge_refresh_operational_alerts_impl();
END;
$;

REVOKE ALL ON FUNCTION public.concierge_refresh_operational_alerts_system() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.concierge_refresh_operational_alerts_system() TO service_role;

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
