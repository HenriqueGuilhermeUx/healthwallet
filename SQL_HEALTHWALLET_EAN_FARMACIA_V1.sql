-- =====================================================
-- HEALTHWALLET EAN / FARMACIA PARCEIRA - V1
-- Execute no Supabase SQL Editor depois de SQL_HEALTHWALLET_REPOSICAO_V1.sql.
-- Objetivo: preparar mapeamento de medicamentos para APIs de farmacia.
-- Regra: EAN quando existir; fallback por substancia + dosagem + forma farmaceutica.
-- =====================================================

-- 1) Campos padronizados no cadastro de medicamentos
ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS ean_code TEXT,
  ADD COLUMN IF NOT EXISTS active_ingredient TEXT,
  ADD COLUMN IF NOT EXISTS standardized_dosage TEXT,
  ADD COLUMN IF NOT EXISTS pharmaceutical_form TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS normalized_product_name TEXT,
  ADD COLUMN IF NOT EXISTS pharmacy_search_key TEXT,
  ADD COLUMN IF NOT EXISTS product_mapping_status TEXT DEFAULT 'unmapped',
  ADD COLUMN IF NOT EXISTS product_mapping_metadata JSONB DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'medications_product_mapping_status_check'
  ) THEN
    ALTER TABLE public.medications
      ADD CONSTRAINT medications_product_mapping_status_check
      CHECK (product_mapping_status IN ('unmapped', 'manual', 'ean', 'substance_dosage', 'partner_matched', 'not_found'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_medications_ean_code ON public.medications(ean_code);
CREATE INDEX IF NOT EXISTS idx_medications_pharmacy_search_key ON public.medications(pharmacy_search_key);
CREATE INDEX IF NOT EXISTS idx_medications_active_ingredient ON public.medications(active_ingredient);

-- 2) Campos padronizados nos pedidos de reposicao/orcamento
ALTER TABLE public.medication_repurchase_requests
  ADD COLUMN IF NOT EXISTS ean_code TEXT,
  ADD COLUMN IF NOT EXISTS active_ingredient TEXT,
  ADD COLUMN IF NOT EXISTS standardized_dosage TEXT,
  ADD COLUMN IF NOT EXISTS pharmaceutical_form TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS normalized_product_name TEXT,
  ADD COLUMN IF NOT EXISTS pharmacy_search_key TEXT,
  ADD COLUMN IF NOT EXISTS product_lookup_payload JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_repurchase_requests_ean_code ON public.medication_repurchase_requests(ean_code);
CREATE INDEX IF NOT EXISTS idx_repurchase_requests_search_key ON public.medication_repurchase_requests(pharmacy_search_key);

-- 3) Base local opcional de mapeamento EAN/produto retornado por parceiro
CREATE TABLE IF NOT EXISTS public.pharma_product_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ean_code TEXT,
  product_name TEXT,
  normalized_product_name TEXT,
  active_ingredient TEXT,
  standardized_dosage TEXT,
  pharmaceutical_form TEXT,
  manufacturer TEXT,
  pharmacy_search_key TEXT,
  source TEXT DEFAULT 'partner',
  mapping_status TEXT DEFAULT 'active' CHECK (mapping_status IN ('active', 'inactive', 'ambiguous', 'not_found')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pharma_product_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pharma_product_mappings_read_authenticated" ON public.pharma_product_mappings;
CREATE POLICY "pharma_product_mappings_read_authenticated" ON public.pharma_product_mappings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_pharma_product_mappings_ean ON public.pharma_product_mappings(ean_code);
CREATE INDEX IF NOT EXISTS idx_pharma_product_mappings_search_key ON public.pharma_product_mappings(pharmacy_search_key);

-- 4) Itens farmaceuticos extraidos de receitas/documentos por IA/OCR
CREATE TABLE IF NOT EXISTS public.prescription_medication_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  medical_record_id UUID REFERENCES public.medical_records(id) ON DELETE CASCADE,
  source_type TEXT DEFAULT 'ocr_document' CHECK (source_type IN ('ocr_document', 'manual', 'professional_document', 'partner_return')),
  medication_name TEXT,
  ean_code TEXT,
  active_ingredient TEXT,
  standardized_dosage TEXT,
  pharmaceutical_form TEXT,
  manufacturer TEXT,
  quantity TEXT,
  instructions TEXT,
  confidence NUMERIC,
  mapping_status TEXT DEFAULT 'extracted' CHECK (mapping_status IN ('extracted', 'mapped_by_ean', 'mapped_by_substance', 'ambiguous', 'ignored')),
  raw_text TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.prescription_medication_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prescription_medication_items_manage_own" ON public.prescription_medication_items;
CREATE POLICY "prescription_medication_items_manage_own" ON public.prescription_medication_items
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_prescription_items_user ON public.prescription_medication_items(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescription_items_record ON public.prescription_medication_items(medical_record_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_ean ON public.prescription_medication_items(ean_code);
CREATE INDEX IF NOT EXISTS idx_prescription_items_active_ingredient ON public.prescription_medication_items(active_ingredient);

-- 5) Coluna opcional no registro de exame/documento para manter o resumo da extracao
ALTER TABLE public.medical_records
  ADD COLUMN IF NOT EXISTS extracted_pharma_items JSONB DEFAULT '[]'::jsonb;

COMMENT ON TABLE public.pharma_product_mappings IS 'Mapa local de EAN/produto usado para integracao com farmacias parceiras.';
COMMENT ON TABLE public.prescription_medication_items IS 'Medicamentos extraidos de receita/documento por IA/OCR. Nao representa prescricao pelo app.';
COMMENT ON COLUMN public.medications.ean_code IS 'EAN/GTIN informado pelo usuario, receita, nota, embalagem ou parceiro. Preferido para consulta de estoque.';
COMMENT ON COLUMN public.medications.pharmacy_search_key IS 'Fallback de busca para farmacia: substancia + dosagem + forma, quando EAN nao existir.';

-- PRONTO.
-- Fluxo esperado:
-- receita/documento -> IA extrai EAN/substancia/dosagem/forma -> pedido de reposicao envia EAN ou fallback padronizado ao parceiro.
