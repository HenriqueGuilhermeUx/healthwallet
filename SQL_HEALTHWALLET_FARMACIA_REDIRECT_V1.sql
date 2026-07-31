-- =====================================================
-- HEALTHWALLET FARMACIA REDIRECT / IFOOD MVP - V1
-- Execute no Supabase SQL Editor depois dos SQLs de reposicao/EAN.
-- Objetivo: medir intenção de compra/reposição ao abrir busca externa em farmácias/marketplaces.
-- Importante: não registra diagnóstico, exame alterado nem doença; só contexto mínimo de produto e origem do clique.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.external_pharmacy_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider TEXT DEFAULT 'ifood_search' CHECK (provider IN ('ifood_search', 'partner_pharmacy', 'other')),
  source_context TEXT CHECK (source_context IN ('medication_low_stock', 'medication_card', 'teleconsultation_prescription', 'uploaded_prescription', 'manual')),
  medication_id UUID REFERENCES public.medications(id) ON DELETE SET NULL,
  medical_record_id UUID REFERENCES public.medical_records(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES public.telemedicine_appointments(id) ON DELETE SET NULL,
  medication_name TEXT,
  ean_code TEXT,
  active_ingredient TEXT,
  standardized_dosage TEXT,
  pharmaceutical_form TEXT,
  manufacturer TEXT,
  search_query TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.external_pharmacy_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "external_pharmacy_clicks_insert_own" ON public.external_pharmacy_clicks;
CREATE POLICY "external_pharmacy_clicks_insert_own" ON public.external_pharmacy_clicks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "external_pharmacy_clicks_select_own" ON public.external_pharmacy_clicks;
CREATE POLICY "external_pharmacy_clicks_select_own" ON public.external_pharmacy_clicks
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_external_pharmacy_clicks_user ON public.external_pharmacy_clicks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_pharmacy_clicks_provider ON public.external_pharmacy_clicks(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_pharmacy_clicks_context ON public.external_pharmacy_clicks(source_context, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_pharmacy_clicks_search_query ON public.external_pharmacy_clicks(search_query);

COMMENT ON TABLE public.external_pharmacy_clicks IS 'Métrica do MVP de redirecionamento para farmácia/marketplace. HealthWallet não vende nem garante disponibilidade.';
COMMENT ON COLUMN public.external_pharmacy_clicks.search_query IS 'Consulta enviada para busca externa, preferencialmente substância ativa + dosagem + forma.';
COMMENT ON COLUMN public.external_pharmacy_clicks.metadata IS 'Metadados mínimos do clique, sem diagnóstico, exame alterado ou inferência clínica.';

-- PRONTO.
-- Fluxo esperado:
-- medicamento/receita -> usuário clica Ver no iFood -> abre busca externa -> registramos intenção comercial não sensível.
