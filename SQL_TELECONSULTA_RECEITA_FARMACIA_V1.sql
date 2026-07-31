-- =====================================================
-- MYDATAMED TELECONSULTA - RECEITA ESTRUTURADA / FARMACIA - V1
-- Execute no Supabase SQL Editor no projeto compartilhado HealthWallet/MyDataMed.
-- Objetivo: a receita gerada dentro da teleconsulta ja nascer pronta para cofre do paciente e cotacao com farmacia parceira.
-- Regra: EAN quando existir; fallback por substancia + dosagem + forma farmaceutica.
-- =====================================================

-- 1) Campos estruturados no agendamento/atendimento
ALTER TABLE public.telemedicine_appointments
  ADD COLUMN IF NOT EXISTS prescription_items JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS prescription_metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pharmacy_quote_ready BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pharmacy_quote_requested_at TIMESTAMPTZ;

-- 2) Itens de receita estruturada emitida pela plataforma
CREATE TABLE IF NOT EXISTS public.telemedicine_prescription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.telemedicine_appointments(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id UUID,
  professional_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  medication_name TEXT,
  ean_code TEXT,
  active_ingredient TEXT,
  standardized_dosage TEXT,
  pharmaceutical_form TEXT,
  manufacturer TEXT,
  quantity TEXT,
  instructions TEXT,
  duration TEXT,
  substitution_allowed BOOLEAN DEFAULT false,
  lookup_strategy TEXT DEFAULT 'substance_dosage_form' CHECK (lookup_strategy IN ('ean', 'substance_dosage_form', 'manual_review')),
  pharmacy_search_key TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.telemedicine_prescription_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telemedicine_prescription_items_patient_read" ON public.telemedicine_prescription_items;
CREATE POLICY "telemedicine_prescription_items_patient_read" ON public.telemedicine_prescription_items
  FOR SELECT USING (auth.uid() = patient_id);

DROP POLICY IF EXISTS "telemedicine_prescription_items_professional_manage" ON public.telemedicine_prescription_items;
CREATE POLICY "telemedicine_prescription_items_professional_manage" ON public.telemedicine_prescription_items
  FOR ALL USING (auth.uid() = professional_user_id)
  WITH CHECK (auth.uid() = professional_user_id);

CREATE INDEX IF NOT EXISTS idx_telemedicine_prescription_items_appointment ON public.telemedicine_prescription_items(appointment_id);
CREATE INDEX IF NOT EXISTS idx_telemedicine_prescription_items_patient ON public.telemedicine_prescription_items(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemedicine_prescription_items_ean ON public.telemedicine_prescription_items(ean_code);
CREATE INDEX IF NOT EXISTS idx_telemedicine_prescription_items_search_key ON public.telemedicine_prescription_items(pharmacy_search_key);

COMMENT ON COLUMN public.telemedicine_appointments.prescription_items IS 'Itens estruturados de receita: EAN preferencial, fallback por substancia/dosagem/forma.';
COMMENT ON TABLE public.telemedicine_prescription_items IS 'Itens de receita emitida pelo profissional na teleconsulta, preparados para cofre do paciente e cotacao com farmacia parceira.';

-- PRONTO.
-- Fluxo esperado:
-- teleconsulta -> profissional conclui com receita estruturada -> HealthWallet/cofre -> cotacao com farmacia parceira se paciente consentir.
