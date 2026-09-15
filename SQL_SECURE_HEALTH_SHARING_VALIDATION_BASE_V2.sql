-- =====================================================
-- SECURE HEALTH SHARING - ISOLATED VALIDATION BASE V2
-- VALIDATION ENVIRONMENT ONLY. NEVER RUN IN PRODUCTION.
--
-- Reproduces the minimum legacy HealthWallet sharing contracts needed to prove
-- SQL_PRE_CONCIERGE_SECURE_SHARING_V2.sql + VIEW_HARDENING_V3 end to end.
-- Contains no production data.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  birth_date DATE,
  gender TEXT,
  blood_type TEXT,
  phone TEXT,
  allergies JSONB DEFAULT '[]'::JSONB,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  family_history TEXT
);

CREATE TABLE public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  cpf CHAR(11) NOT NULL UNIQUE,
  professional_register TEXT NOT NULL,
  register_state CHAR(2) NOT NULL,
  professional_type TEXT NOT NULL,
  verification_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (professional_register, register_state)
);

CREATE TABLE public.access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code CHAR(6) NOT NULL,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  permissions JSONB NOT NULL DEFAULT '{}'::JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  share_categories JSONB,
  revoked BOOLEAN DEFAULT false,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE public.shared_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_code TEXT NOT NULL,
  professional_email TEXT,
  permissions JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.health_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_summary TEXT,
  summary TEXT
);

CREATE TABLE public.health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score INTEGER,
  status TEXT,
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT,
  title TEXT,
  exam_type TEXT,
  ai_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  medication_name TEXT,
  dosage TEXT,
  frequency TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.health_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_name TEXT,
  card_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.medical_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  event_date TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.health_daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_date DATE NOT NULL,
  device_context_score INTEGER,
  device_confidence INTEGER,
  score_factors JSONB DEFAULT '{}'::JSONB,
  steps INTEGER,
  sleep_minutes INTEGER,
  resting_heart_rate NUMERIC,
  avg_heart_rate NUMERIC,
  spo2_avg NUMERIC,
  systolic_bp NUMERIC,
  diastolic_bp NUMERIC,
  weight_kg NUMERIC,
  sources TEXT[] DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.alergias_paciente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT,
  descricao TEXT
);

CREATE TABLE public.patient_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao TEXT,
  ativa BOOLEAN DEFAULT true
);

CREATE TABLE public.medication_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  ativo BOOLEAN DEFAULT true
);

CREATE TABLE public.consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medico_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  data_consulta TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.document_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT,
  document_id UUID,
  recipient_email TEXT,
  document_hash TEXT,
  confirmation_status TEXT,
  confirmed_at TIMESTAMPTZ,
  delivery_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  medico_id UUID REFERENCES public.professionals(id) ON DELETE CASCADE,
  paciente_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.exames_tuss (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_tuss TEXT,
  descricao TEXT,
  categoria TEXT,
  ativo BOOLEAN DEFAULT true
);

CREATE TABLE public.principios_ativos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT,
  dcb TEXT
);

CREATE TABLE public.laboratorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT
);

CREATE TABLE public.formas_farmaceuticas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT
);

CREATE TABLE public.medicamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_ms TEXT,
  nome_comercial TEXT,
  concentracao TEXT,
  tarja TEXT,
  tipo_receita TEXT,
  regime_controlado TEXT,
  principio_ativo_id UUID REFERENCES public.principios_ativos(id),
  laboratorio_id UUID REFERENCES public.laboratorios(id),
  forma_farmaceutica_id UUID REFERENCES public.formas_farmaceuticas(id),
  ativo BOOLEAN DEFAULT true
);

-- Legacy helper functions that V2 intentionally closes to client roles.
CREATE OR REPLACE FUNCTION public.generate_access_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN lpad(floor(random() * 1000000)::TEXT, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_access_code(
  p_patient_id UUID,
  p_permissions JSONB,
  p_duration_hours INTEGER DEFAULT 24
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.access_codes(code, patient_id, permissions, expires_at)
  VALUES (public.generate_access_code(), p_patient_id, p_permissions, NOW() + make_interval(hours => p_duration_hours))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Enable RLS on every exposed base table.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alergias_paciente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exames_tuss ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.principios_ativos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laboratorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formas_farmaceuticas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicamentos ENABLE ROW LEVEL SECURITY;

-- Legacy owner + bearer sharing policies.
CREATE POLICY "Users manage own access codes" ON public.access_codes FOR ALL TO authenticated USING (auth.uid() = patient_id) WITH CHECK (auth.uid() = patient_id);
CREATE POLICY codes_insert ON public.access_codes FOR INSERT TO public WITH CHECK (true);
CREATE POLICY codes_patient ON public.access_codes FOR SELECT TO public USING (auth.uid() = patient_id);
CREATE POLICY codes_select ON public.access_codes FOR SELECT TO public USING (expires_at > NOW());
CREATE POLICY "Public can read valid shared access by code" ON public.shared_access FOR SELECT TO public USING (expires_at > NOW());
CREATE POLICY "Users create own share access" ON public.shared_access FOR INSERT TO authenticated WITH CHECK (auth.uid() = patient_id);

CREATE POLICY profiles_owner ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY health_summaries_owner ON public.health_summaries FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY health_scores_owner ON public.health_scores FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY medical_records_owner ON public.medical_records FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY medications_owner ON public.medications FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY health_plans_owner ON public.health_plans FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY medical_events_owner ON public.medical_events FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY daily_summaries_owner ON public.health_daily_summaries FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow shared health_summaries" ON public.health_summaries FOR SELECT TO public USING (EXISTS (SELECT 1 FROM public.shared_access sa WHERE sa.patient_id=health_summaries.user_id AND sa.expires_at>NOW()));
CREATE POLICY "Allow shared health_scores" ON public.health_scores FOR SELECT TO public USING (EXISTS (SELECT 1 FROM public.shared_access sa WHERE sa.patient_id=health_scores.user_id AND sa.expires_at>NOW()));
CREATE POLICY "Allow shared medical_records" ON public.medical_records FOR SELECT TO public USING (EXISTS (SELECT 1 FROM public.shared_access sa WHERE sa.patient_id=medical_records.user_id AND sa.expires_at>NOW()));
CREATE POLICY "Allow shared medications" ON public.medications FOR SELECT TO public USING (EXISTS (SELECT 1 FROM public.shared_access sa WHERE sa.patient_id=medications.user_id AND sa.expires_at>NOW()));
CREATE POLICY "Allow shared medical_events" ON public.medical_events FOR SELECT TO public USING (EXISTS (SELECT 1 FROM public.shared_access sa WHERE sa.patient_id=medical_events.user_id AND sa.expires_at>NOW()));

CREATE POLICY prof_view ON public.professionals FOR SELECT TO public USING (auth.uid() = user_id);
CREATE POLICY prof_insert ON public.professionals FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY prof_update ON public.professionals FOR UPDATE TO public USING (auth.uid() = user_id);
CREATE POLICY alergias_paciente_all ON public.alergias_paciente FOR ALL TO public USING (paciente_id = auth.uid());
CREATE POLICY pc_paciente_all ON public.patient_conditions FOR ALL TO public USING (paciente_id = auth.uid());
CREATE POLICY mu_paciente_all ON public.medication_uses FOR ALL TO public USING (paciente_id = auth.uid());
CREATE POLICY consultations_paciente_select ON public.consultations FOR SELECT TO public USING (paciente_id = auth.uid());
CREATE POLICY consultations_medico_all ON public.consultations FOR ALL TO public USING (medico_id IN (SELECT id FROM public.professionals WHERE user_id=auth.uid()));
CREATE POLICY dd_paciente_select ON public.document_deliveries FOR SELECT TO public USING (paciente_id = auth.uid());
CREATE POLICY dd_medico_all ON public.document_deliveries FOR ALL TO public USING (medico_id IN (SELECT id FROM public.professionals WHERE user_id=auth.uid()));

CREATE POLICY mu_professional_select ON public.medication_uses FOR SELECT TO public USING (EXISTS (SELECT 1 FROM public.access_codes ac WHERE ac.patient_id=medication_uses.paciente_id AND ac.professional_id IN (SELECT id FROM public.professionals WHERE user_id=auth.uid()) AND ac.used_at IS NOT NULL));
CREATE POLICY pc_professional_select ON public.patient_conditions FOR SELECT TO public USING (EXISTS (SELECT 1 FROM public.access_codes ac WHERE ac.patient_id=patient_conditions.paciente_id AND ac.professional_id IN (SELECT id FROM public.professionals WHERE user_id=auth.uid()) AND ac.used_at IS NOT NULL));

CREATE POLICY exames_tuss_public_read ON public.exames_tuss FOR SELECT TO public USING (true);
CREATE POLICY medicamentos_read ON public.medicamentos FOR SELECT TO public USING (true);
CREATE POLICY principios_ativos_read ON public.principios_ativos FOR SELECT TO public USING (true);
CREATE POLICY laboratorios_read ON public.laboratorios FOR SELECT TO public USING (true);

-- Legacy SECURITY DEFINER-style views (default PostgreSQL behavior).
CREATE VIEW public.patient_device_score_latest AS
SELECT DISTINCT ON (user_id)
  user_id, summary_date, device_context_score, device_confidence, score_factors,
  steps, sleep_minutes, resting_heart_rate, avg_heart_rate, spo2_avg,
  systolic_bp, diastolic_bp, weight_kg, sources, last_sync_at, updated_at
FROM public.health_daily_summaries
ORDER BY user_id, summary_date DESC, updated_at DESC;

CREATE VIEW public.vw_document_deliveries_public AS
SELECT d.id, d.document_type, d.document_id, d.recipient_email, d.document_hash,
  d.confirmation_status, d.confirmed_at, d.delivery_status, d.created_at,
  p.full_name AS medico_nome, p.professional_register AS medico_crm, p.register_state AS medico_uf
FROM public.document_deliveries d
JOIN public.professionals p ON p.id=d.medico_id;

CREATE VIEW public.vw_exames_autocomplete AS
SELECT id, codigo_tuss, descricao, categoria, ativo
FROM public.exames_tuss
WHERE ativo=true;

CREATE VIEW public.vw_medicamentos_autocomplete AS
SELECT m.id, m.registro_ms, m.nome_comercial, m.concentracao, m.tarja,
  m.tipo_receita, m.regime_controlado, m.principio_ativo_id,
  pa.nome AS principio_ativo, pa.dcb, l.nome AS laboratorio,
  ff.descricao AS forma_farmaceutica, m.ativo
FROM public.medicamentos m
LEFT JOIN public.principios_ativos pa ON pa.id=m.principio_ativo_id
LEFT JOIN public.laboratorios l ON l.id=m.laboratorio_id
LEFT JOIN public.formas_farmaceuticas ff ON ff.id=m.forma_farmaceutica_id;

CREATE VIEW public.vw_patient_clinical_context AS
SELECT p.id AS paciente_id, p.birth_date, p.gender, p.blood_type, p.phone,
  (SELECT count(*) FROM public.alergias_paciente a WHERE a.paciente_id=p.id AND a.tipo='medicamento') AS n_alergias,
  (SELECT count(*) FROM public.patient_conditions c WHERE c.paciente_id=p.id AND c.ativa) AS n_condicoes,
  (SELECT count(*) FROM public.medication_uses m WHERE m.paciente_id=p.id AND m.ativo) AS n_medicacoes,
  (SELECT max(c.data_consulta) FROM public.consultations c WHERE c.paciente_id=p.id) AS ultima_consulta
FROM public.profiles p;

-- Mimic legacy broad Data API defaults so V2/V3 must explicitly close them.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_access_code() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_access_code(UUID, JSONB, INTEGER) TO anon, authenticated;

SELECT 'PASS' AS secure_sharing_validation_base;
