-- =====================================================
-- HEALTHWALLET GENETICA / DNA - V1
-- Execute no Supabase SQL Editor antes de usar a tela /genetics.
-- Objetivo: cofre seguro para laudos geneticos, resumo educativo e interesse futuro em teste genetico.
-- Importante: genetica e dado pessoal sensivel. Nao usar para diagnostico automatico, prescricao ou alteracao de dose.
-- =====================================================

-- 1) Bucket privado para dados geneticos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'genetic-reports',
  'genetic-reports',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/octet-stream'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies do bucket privado: usuario so acessa arquivos dentro da pasta com seu proprio user_id
DROP POLICY IF EXISTS "genetic_reports_storage_insert_own" ON storage.objects;
CREATE POLICY "genetic_reports_storage_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'genetic-reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "genetic_reports_storage_select_own" ON storage.objects;
CREATE POLICY "genetic_reports_storage_select_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'genetic-reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "genetic_reports_storage_update_own" ON storage.objects;
CREATE POLICY "genetic_reports_storage_update_own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'genetic-reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  ) WITH CHECK (
    bucket_id = 'genetic-reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "genetic_reports_storage_delete_own" ON storage.objects;
CREATE POLICY "genetic_reports_storage_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'genetic-reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 2) Consentimento especifico para dado genetico
CREATE TABLE IF NOT EXISTS public.genetic_upload_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  consent_version TEXT DEFAULT 'genetics_v1',
  consent_text TEXT NOT NULL,
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.genetic_upload_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "genetic_upload_consents_manage_own" ON public.genetic_upload_consents;
CREATE POLICY "genetic_upload_consents_manage_own" ON public.genetic_upload_consents
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3) Relatorios geneticos do cofre
CREATE TABLE IF NOT EXISTS public.genetic_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT,
  file_size BIGINT,
  mime_type TEXT,
  source_company TEXT,
  test_type TEXT DEFAULT 'unknown' CHECK (test_type IN ('pdf_report', 'microarray_raw', 'vcf_raw', 'wes', 'wgs', 'ancestry', 'pharmacogenomics', 'unknown')),
  raw_data_uploaded BOOLEAN DEFAULT false,
  privacy_level TEXT DEFAULT 'genetic_sensitive',
  analysis_status TEXT DEFAULT 'processed' CHECK (analysis_status IN ('pending', 'processed', 'needs_review', 'failed')),
  ai_summary TEXT,
  categories JSONB DEFAULT '[]'::jsonb,
  extraction_payload JSONB DEFAULT '{}'::jsonb,
  caution_text TEXT DEFAULT 'Conteudo educativo. Nao use para diagnostico, tratamento, prescricao, troca ou ajuste de medicamento sem profissional de saude/geneticista.',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.genetic_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "genetic_reports_manage_own" ON public.genetic_reports;
CREATE POLICY "genetic_reports_manage_own" ON public.genetic_reports
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_genetic_reports_user ON public.genetic_reports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_genetic_reports_test_type ON public.genetic_reports(test_type, created_at DESC);

-- 4) Achados extraidos/organizados por categoria, sempre com revisao profissional quando houver uso clinico
CREATE TABLE IF NOT EXISTS public.genetic_report_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.genetic_reports(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('summary', 'pharmacogenomics', 'nutrition', 'metabolism', 'fitness', 'hereditary_risk', 'carrier_status', 'ancestry', 'wellness', 'general')),
  gene TEXT,
  variant TEXT,
  rsid TEXT,
  condition_or_trait TEXT,
  evidence_level TEXT,
  clinical_actionability TEXT DEFAULT 'educational',
  summary TEXT,
  recommendation_text TEXT,
  requires_professional_review BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.genetic_report_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "genetic_report_findings_manage_own" ON public.genetic_report_findings;
CREATE POLICY "genetic_report_findings_manage_own" ON public.genetic_report_findings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_genetic_report_findings_user ON public.genetic_report_findings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_genetic_report_findings_report ON public.genetic_report_findings(report_id);
CREATE INDEX IF NOT EXISTS idx_genetic_report_findings_category ON public.genetic_report_findings(category);

-- 5) Interesse futuro em realizar exame genetico com parceiro
CREATE TABLE IF NOT EXISTS public.genetic_partner_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  interest_type TEXT DEFAULT 'health_genetics',
  city TEXT,
  state TEXT,
  preferred_price_range TEXT,
  consent_to_contact BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'interested' CHECK (status IN ('interested', 'contacted', 'converted', 'cancelled')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.genetic_partner_interest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "genetic_partner_interest_manage_own" ON public.genetic_partner_interest;
CREATE POLICY "genetic_partner_interest_manage_own" ON public.genetic_partner_interest
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_genetic_partner_interest_user ON public.genetic_partner_interest(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_genetic_partner_interest_status ON public.genetic_partner_interest(status, created_at DESC);

COMMENT ON TABLE public.genetic_reports IS 'Cofre genetico do HealthWallet. Dado sensivel, bucket privado, uso educativo e revisao profissional quando aplicavel.';
COMMENT ON TABLE public.genetic_report_findings IS 'Achados geneticos organizados para leitura educativa; nao representam diagnostico automatico.';
COMMENT ON TABLE public.genetic_partner_interest IS 'Leads consentidos para futura parceria de exame genetico, sem venda automatica.';

-- PRONTO.
-- Fluxo esperado:
-- usuario aceita consentimento genetico -> sobe laudo/raw data -> arquivo privado -> resumo educativo -> perguntas para medico -> interesse futuro em teste parceiro.
