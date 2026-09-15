-- =====================================================
-- HEALTHWALLET / HEALTH CONCIERGE - VALIDATION BASE V1
-- VALIDATION ENVIRONMENT ONLY. NEVER RUN IN PRODUCTION.
--
-- Purpose:
-- Reproduce the minimum canonical HealthWallet data contracts consumed by
-- Concierge in an isolated Supabase local/CI environment. This file contains
-- synthetic-environment schema only; it copies NO production rows.
--
-- Source of truth used to build this contract:
-- - current HealthWallet public schema catalog (read-only inspection)
-- - existing HealthWallet SQL files in this repository
-- - current Concierge patient/context code
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------
-- Patient profile / plan
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  birth_date DATE,
  gender TEXT,
  blood_type TEXT,
  allergies TEXT[],
  phone TEXT,
  weight INTEGER,
  height INTEGER,
  chronic_conditions TEXT,
  current_medications TEXT,
  med_score INTEGER,
  accepted_terms BOOLEAN DEFAULT false,
  accepted_terms_at TIMESTAMPTZ,
  accepted_privacy BOOLEAN DEFAULT false,
  accepted_privacy_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.health_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  plan_type TEXT NOT NULL,
  card_number TEXT NOT NULL,
  operator_name TEXT,
  beneficiary_name TEXT NOT NULL,
  validity TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------
-- Canonical HealthWallet domains reused by Concierge
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  birth_date DATE,
  blood_type TEXT,
  allergies TEXT[],
  medications TEXT,
  conditions TEXT,
  health_plan TEXT,
  notes TEXT,
  member_type TEXT DEFAULT 'patient',
  phone TEXT,
  email TEXT,
  is_elderly BOOLEAN DEFAULT false,
  is_caregiver BOOLEAN DEFAULT false,
  master_access BOOLEAN DEFAULT false,
  emergency_contact BOOLEAN DEFAULT false,
  notify_medications BOOLEAN DEFAULT true,
  notify_appointments BOOLEAN DEFAULT true,
  notify_exams BOOLEAN DEFAULT true,
  notify_sos BOOLEAN DEFAULT true,
  preferred_contact_method TEXT DEFAULT 'whatsapp',
  care_notes TEXT,
  profile_mode TEXT DEFAULT 'managed_by_owner',
  consent_required BOOLEAN DEFAULT false,
  signature_required BOOLEAN DEFAULT false,
  invitation_required BOOLEAN DEFAULT false,
  managed_by_owner BOOLEAN DEFAULT true,
  data_entry_status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  reminder_time TEXT,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_family_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  target_name TEXT DEFAULT 'Eu',
  notify_caregivers BOOLEAN DEFAULT false,
  critical_medication BOOLEAN DEFAULT false,
  stock_quantity INTEGER,
  pills_per_day NUMERIC,
  stock_alert_threshold INTEGER DEFAULT 5,
  last_taken_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTE: target_family_member_id/requires_confirmation/updated_at reflect the
-- intended family schema already present in SQL_FAMILIA_IDOSOS_FASE1.sql.
-- Production currently has schema drift for these reminder columns; validation
-- keeps the intended contract without mutating production.
CREATE TABLE IF NOT EXISTS public.health_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  reminder_date DATE,
  reminder_time TIME,
  frequency TEXT DEFAULT 'once',
  is_done BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  target_family_member_id UUID REFERENCES public.family_members(id) ON DELETE CASCADE,
  requires_confirmation BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_url TEXT,
  file_name TEXT NOT NULL,
  exam_type TEXT,
  exam_date DATE,
  laboratory TEXT,
  extracted_data JSONB,
  ai_analysis TEXT,
  status TEXT DEFAULT 'pending',
  ai_result JSONB,
  extracted_text TEXT,
  analyzed_at TIMESTAMPTZ,
  extracted_pharma_items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.medical_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  status TEXT NOT NULL,
  factors JSONB,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  device_context_score INTEGER,
  device_confidence INTEGER,
  device_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_categories TEXT[] NOT NULL DEFAULT '{}'::text[],
  score_version TEXT NOT NULL DEFAULT 'medscore_v1'
);

CREATE TABLE IF NOT EXISTS public.health_device_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT,
  display_name TEXT,
  source_device TEXT,
  status TEXT NOT NULL DEFAULT 'connected',
  scopes_authorized TEXT[] NOT NULL DEFAULT '{}'::text[],
  last_sync_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  CHECK (status IN ('connected','disconnected','revoked','error'))
);

CREATE TABLE IF NOT EXISTS public.health_daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_date DATE NOT NULL,
  sources TEXT[] NOT NULL DEFAULT '{}'::text[],
  data_points INTEGER NOT NULL DEFAULT 0,
  steps INTEGER,
  sleep_minutes INTEGER,
  resting_heart_rate NUMERIC,
  avg_heart_rate NUMERIC,
  hrv_avg NUMERIC,
  spo2_avg NUMERIC,
  systolic_bp NUMERIC,
  diastolic_bp NUMERIC,
  weight_kg NUMERIC,
  temperature_c NUMERIC,
  active_calories NUMERIC,
  activity_minutes NUMERIC,
  device_context_score INTEGER,
  device_confidence INTEGER,
  score_factors JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_quality JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, summary_date)
);

CREATE TABLE IF NOT EXISTS public.telemedicine_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL,
  reason TEXT,
  preferred_date DATE,
  preferred_time TIME,
  status TEXT DEFAULT 'requested',
  professional_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  professional_name TEXT,
  clinic_name TEXT,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Minimal event queue contract used by Concierge messaging/request emission.
-- Narrative health text is intentionally not required in the payload.
CREATE TABLE IF NOT EXISTS public.automation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  source_app TEXT NOT NULL,
  source_table TEXT,
  source_id UUID,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT,
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------
-- Least-privilege owner-only RLS for canonical HealthWallet tables.
-- Concierge professional access to clinical context must occur through the
-- request-scoped SECURITY DEFINER RPC, not blanket SELECT policies here.
-- -----------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','health_plans','family_members','medications','health_reminders',
    'medical_records','medical_events','health_scores','health_device_connections',
    'health_daily_summaries','telemedicine_appointments','automation_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS validation_profiles_owner ON public.profiles;
CREATE POLICY validation_profiles_owner ON public.profiles
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS validation_health_plans_owner ON public.health_plans;
CREATE POLICY validation_health_plans_owner ON public.health_plans
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS validation_family_members_owner ON public.family_members;
CREATE POLICY validation_family_members_owner ON public.family_members
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS validation_medications_owner ON public.medications;
CREATE POLICY validation_medications_owner ON public.medications
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS validation_health_reminders_owner ON public.health_reminders;
CREATE POLICY validation_health_reminders_owner ON public.health_reminders
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS validation_medical_records_owner ON public.medical_records;
CREATE POLICY validation_medical_records_owner ON public.medical_records
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS validation_medical_events_owner ON public.medical_events;
CREATE POLICY validation_medical_events_owner ON public.medical_events
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS validation_health_scores_owner ON public.health_scores;
CREATE POLICY validation_health_scores_owner ON public.health_scores
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS validation_device_connections_owner ON public.health_device_connections;
CREATE POLICY validation_device_connections_owner ON public.health_device_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS validation_daily_summaries_owner ON public.health_daily_summaries;
CREATE POLICY validation_daily_summaries_owner ON public.health_daily_summaries
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS validation_telemedicine_owner ON public.telemedicine_appointments;
CREATE POLICY validation_telemedicine_owner ON public.telemedicine_appointments
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS validation_automation_patient_insert ON public.automation_events;
CREATE POLICY validation_automation_patient_insert ON public.automation_events
  FOR INSERT TO authenticated
  WITH CHECK (
    patient_id = auth.uid()
    AND actor_user_id = auth.uid()
    AND actor_role = 'patient'
  );

DROP POLICY IF EXISTS validation_automation_patient_read ON public.automation_events;
CREATE POLICY validation_automation_patient_read ON public.automation_events
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid() AND actor_user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.profiles,
  public.health_plans,
  public.family_members,
  public.medications,
  public.health_reminders,
  public.medical_records,
  public.medical_events,
  public.health_scores,
  public.health_device_connections,
  public.health_daily_summaries,
  public.telemedicine_appointments,
  public.automation_events
TO authenticated;

SELECT 'PASS' AS validation_base_schema,
       'Minimal canonical HealthWallet contracts ready; no production data copied.' AS message;
