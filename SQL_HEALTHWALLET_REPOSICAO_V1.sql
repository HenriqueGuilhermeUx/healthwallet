-- =====================================================
-- HEALTHWALLET REPOSICAO INTELIGENTE - V1
-- Execute no Supabase SQL Editor antes de publicar/usar a versao 1.0.5.
-- Objetivo: preparar reposicao assistida por farmacias parceiras, sem venda propria.
-- =====================================================

-- 1) Preferencias comerciais/operacionais do usuario
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allow_medication_repurchase_offers BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS repurchase_preferences JSONB DEFAULT '{}'::jsonb;

-- 2) Evolucao de medicamentos para consentimento e auditoria de reposicao
ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS allow_repurchase_offers BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_repurchase_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS repurchase_metadata JSONB DEFAULT '{}'::jsonb;

-- 3) Metadados nos lembretes para canais: push/local, email, calendario e n8n
ALTER TABLE public.health_reminders
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 4) Pedidos de reposicao/orcamento para parceiros
CREATE TABLE IF NOT EXISTS public.medication_repurchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  medication_id UUID REFERENCES public.medications(id) ON DELETE SET NULL,
  target_family_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  patient_name TEXT,
  medication_name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT,
  stock_quantity NUMERIC,
  estimated_stock_days INTEGER,
  preferred_channel TEXT DEFAULT 'partner_quote',
  status TEXT DEFAULT 'requested' CHECK (status IN ('requested', 'sent_to_partner', 'quoted', 'accepted', 'cancelled', 'completed', 'failed')),
  consent_snapshot JSONB DEFAULT '{}'::jsonb,
  partner_payload JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.medication_repurchase_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "medication_repurchase_requests_manage_own" ON public.medication_repurchase_requests;
CREATE POLICY "medication_repurchase_requests_manage_own" ON public.medication_repurchase_requests
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_medication_repurchase_requests_user ON public.medication_repurchase_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_medication_repurchase_requests_status ON public.medication_repurchase_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_medication_repurchase_requests_medication ON public.medication_repurchase_requests(medication_id);

-- 5) Permitir que o app do paciente registre eventos de automacao para o n8n, se a tabela existir
DO $$
BEGIN
  IF to_regclass('public.automation_events') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.automation_events ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      DROP POLICY IF EXISTS "automation_events_patient_insert_healthwallet" ON public.automation_events;
      CREATE POLICY "automation_events_patient_insert_healthwallet" ON public.automation_events
        FOR INSERT
        WITH CHECK (auth.uid() = patient_user_id AND source IN ('healthwallet_app', 'healthwallet'));
    EXCEPTION WHEN OTHERS THEN
      -- Caso a tabela automation_events tenha outro formato, ignore e use o n8n/API depois.
      NULL;
    END;
  END IF;
END $$;

-- 6) Comentarios de produto/compliance
COMMENT ON TABLE public.medication_repurchase_requests IS 'Pedidos de reposicao/orcamento para farmacia parceira. HealthWallet nao prescreve nem vende diretamente.';
COMMENT ON COLUMN public.medications.allow_repurchase_offers IS 'Consentimento do usuario para receber lembretes e opcoes de reposicao do medicamento cadastrado.';
COMMENT ON COLUMN public.medication_repurchase_requests.consent_snapshot IS 'Registro do consentimento e contexto do pedido de reposicao no momento da solicitacao.';

-- PRONTO.
-- Fluxo esperado:
-- medicamento cadastrado -> controle de estoque -> alerta de recompra -> pedido de orcamento -> parceiro autorizado.
