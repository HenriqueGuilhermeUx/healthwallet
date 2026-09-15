-- =====================================================
-- PRE-CONCIERGE SECURITY V1 - ISOLATED VALIDATION DEPENDENCIES
-- VALIDATION ENVIRONMENT ONLY. NEVER RUN IN PRODUCTION.
--
-- Adds only the minimum legacy contracts/functions required to execute
-- SQL_PRE_CONCIERGE_SECURITY_HARDENING_V1.sql in the ephemeral sharing stack.
-- Implementations are synthetic stubs; signatures mirror the live database.
-- =====================================================

ALTER TABLE public.health_daily_summaries
  ADD COLUMN IF NOT EXISTS data_points INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hrv_avg NUMERIC,
  ADD COLUMN IF NOT EXISTS temperature_c NUMERIC,
  ADD COLUMN IF NOT EXISTS active_calories NUMERIC,
  ADD COLUMN IF NOT EXISTS activity_minutes NUMERIC,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS uq_validation_health_daily_summary_user_date
  ON public.health_daily_summaries(user_id, summary_date);

CREATE TABLE IF NOT EXISTS public.health_data_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id UUID,
  actor_role TEXT,
  action TEXT NOT NULL,
  data_category TEXT,
  source_app TEXT,
  reference_table TEXT,
  reference_id UUID,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.professional_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  plan_name TEXT,
  plan_price_cents INTEGER,
  monthly_price_cents INTEGER,
  billing_cycle TEXT,
  status TEXT,
  free_patient_data_access BOOLEAN DEFAULT false,
  commercial_area_enabled BOOLEAN DEFAULT false,
  trial_days INTEGER,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  current_period_starts_at TIMESTAMPTZ,
  current_period_ends_at TIMESTAMPTZ,
  features JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.professional_feature_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  feature_key TEXT NOT NULL,
  access_level TEXT,
  enabled BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  source TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (professional_user_id, feature_key)
);

-- Exact live signatures referenced by V1 ALTER/GRANT statements.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.update_medicamento_search()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.check_receita_safety(INTEGER)
RETURNS JSONB LANGUAGE sql AS $$ SELECT '{}'::JSONB $$;

CREATE OR REPLACE FUNCTION public.check_clinical_alerts(UUID, INTEGER)
RETURNS JSONB LANGUAGE sql AS $$ SELECT '[]'::JSONB $$;

CREATE OR REPLACE FUNCTION public.set_telemedicine_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at_generic()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.set_professional_documents_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.set_sign_tokens_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.expire_old_sign_tokens()
RETURNS INTEGER LANGUAGE sql AS $$ SELECT 0 $$;

CREATE OR REPLACE FUNCTION public.activate_mydatamed_pro_after_payment(UUID, UUID, UUID)
RETURNS UUID LANGUAGE sql SECURITY DEFINER AS $$ SELECT $1 $$;

CREATE OR REPLACE FUNCTION public.increment_precheck_submission_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.record_mydatamed_usage(UUID, TEXT, INTEGER, TEXT, UUID, TEXT, JSONB)
RETURNS UUID LANGUAGE sql SECURITY DEFINER AS $$ SELECT gen_random_uuid() $$;

CREATE OR REPLACE FUNCTION public.on_clinical_visit_record_mydatamed_usage()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.sign_and_lock_clinical_visit(UUID)
RETURNS UUID LANGUAGE sql SECURITY DEFINER AS $$ SELECT $1 $$;

CREATE OR REPLACE FUNCTION public.hw_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.hw_clamp_int(NUMERIC, INTEGER, INTEGER)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT greatest($2, least($3, round($1)::INTEGER)) $$;

CREATE OR REPLACE FUNCTION public.calculate_device_context_score(
  INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, INTEGER, TIMESTAMPTZ
)
RETURNS INTEGER LANGUAGE sql AS $$ SELECT 0 $$;

CREATE OR REPLACE FUNCTION public.recalculate_health_daily_summary_score()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.hw_email_inbox_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.ensure_health_inbound_email_address(UUID, TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER AS $$ SELECT 'synthetic@healthwallet.test'::TEXT $$;

CREATE OR REPLACE FUNCTION public.mark_health_inbox_forwarding_verified(UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$ SELECT true $$;

-- Reproduce the broad legacy execution defaults V1 is expected to narrow.
GRANT EXECUTE ON FUNCTION public.activate_mydatamed_pro_after_payment(UUID, UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_mydatamed_usage(UUID, TEXT, INTEGER, TEXT, UUID, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.on_clinical_visit_record_mydatamed_usage() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_and_lock_clinical_visit(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_health_inbound_email_address(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_health_inbox_forwarding_verified(UUID) TO anon, authenticated;

SELECT 'PASS' AS pre_concierge_v1_validation_dependencies;
