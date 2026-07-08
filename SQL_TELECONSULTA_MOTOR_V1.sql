-- =====================================================
-- HEALTHWALLET / MYDATAMED - MOTOR DE TELECONSULTA V1
-- Execute no Supabase SQL Editor.
-- Objetivo: agenda profissional, confirmação do paciente, compartilhamento por evento,
-- link de chamada, lembrete, início/fim da consulta e registro de orientação/receita.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Tabela principal
CREATE TABLE IF NOT EXISTS public.telemedicine_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Paciente
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_name TEXT,
  patient_email TEXT,

  -- Profissional / clínica
  professional_id UUID,
  professional_name TEXT,
  professional_email TEXT,
  clinic_id UUID,
  clinic_name TEXT,

  -- Consulta
  specialty TEXT DEFAULT 'Clínica geral',
  reason TEXT,
  preferred_date DATE,
  preferred_time TIME,
  scheduled_at TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 30,
  timezone TEXT DEFAULT 'America/Sao_Paulo',

  -- Chamada
  status TEXT DEFAULT 'requested',
  provider TEXT DEFAULT 'manual_link',
  room_url TEXT,
  meet_url TEXT,
  google_calendar_event_id TEXT,

  -- Consentimento / confirmação
  patient_confirmed BOOLEAN DEFAULT false,
  patient_confirmed_at TIMESTAMPTZ,
  professional_confirmed BOOLEAN DEFAULT false,
  professional_confirmed_at TIMESTAMPTZ,
  data_sharing_authorized BOOLEAN DEFAULT false,
  data_sharing_authorized_at TIMESTAMPTZ,
  shared_data_permissions JSONB DEFAULT '{"summary":true,"exams":true,"medications":true,"timeline":true,"passport":true,"medscore":true}'::jsonb,

  -- Andamento
  reminder_sent_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,

  -- Pós-consulta
  professional_notes TEXT,
  prescription_text TEXT,
  orientation_text TEXT,
  prescription_sent_at TIMESTAMPTZ,

  -- Pagamentos futuros NextGen / Woovi
  payment_status TEXT DEFAULT 'not_required',
  payment_amount_cents INTEGER,
  payment_provider TEXT,
  payment_reference TEXT,
  woovi_charge_id TEXT,
  pix_qr_code TEXT,
  pix_copy_paste TEXT,
  paid_at TIMESTAMPTZ,
  platform_fee_cents INTEGER,
  split_paid_at TIMESTAMPTZ,

  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Evoluir tabela existente caso já tenha sido criada antes
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS patient_name TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS patient_email TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS professional_id UUID;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS professional_name TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS professional_email TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS clinic_id UUID;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS clinic_name TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS specialty TEXT DEFAULT 'Clínica geral';
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS preferred_date DATE;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS preferred_time TIME;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 30;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo';
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'requested';
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'manual_link';
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS room_url TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS meet_url TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS patient_confirmed BOOLEAN DEFAULT false;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS patient_confirmed_at TIMESTAMPTZ;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS professional_confirmed BOOLEAN DEFAULT false;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS professional_confirmed_at TIMESTAMPTZ;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS data_sharing_authorized BOOLEAN DEFAULT false;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS data_sharing_authorized_at TIMESTAMPTZ;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS shared_data_permissions JSONB DEFAULT '{"summary":true,"exams":true,"medications":true,"timeline":true,"passport":true,"medscore":true}'::jsonb;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS professional_notes TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS prescription_text TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS orientation_text TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS prescription_sent_at TIMESTAMPTZ;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'not_required';
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS payment_amount_cents INTEGER;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS payment_provider TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS woovi_charge_id TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS pix_qr_code TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS pix_copy_paste TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS split_paid_at TIMESTAMPTZ;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3) Compatibilidade entre HealthWallet e MyDataMed
UPDATE public.telemedicine_appointments
SET patient_id = COALESCE(patient_id, user_id),
    user_id = COALESCE(user_id, patient_id)
WHERE patient_id IS NULL OR user_id IS NULL;

-- 4) Logs/eventos da consulta
CREATE TABLE IF NOT EXISTS public.telemedicine_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.telemedicine_appointments(id) ON DELETE CASCADE NOT NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  professional_id UUID,
  patient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.telemedicine_events ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.telemedicine_events ADD COLUMN IF NOT EXISTS professional_id UUID;
ALTER TABLE public.telemedicine_events ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.telemedicine_events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.telemedicine_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 5) Índices
CREATE INDEX IF NOT EXISTS idx_telemedicine_patient ON public.telemedicine_appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_telemedicine_user ON public.telemedicine_appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_telemedicine_professional ON public.telemedicine_appointments(professional_id);
CREATE INDEX IF NOT EXISTS idx_telemedicine_status ON public.telemedicine_appointments(status);
CREATE INDEX IF NOT EXISTS idx_telemedicine_date ON public.telemedicine_appointments(preferred_date, preferred_time);
CREATE INDEX IF NOT EXISTS idx_telemedicine_events_appointment ON public.telemedicine_events(appointment_id);

-- 6) updated_at automático
CREATE OR REPLACE FUNCTION public.set_telemedicine_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_telemedicine_appointments_updated_at ON public.telemedicine_appointments;
CREATE TRIGGER trg_telemedicine_appointments_updated_at
BEFORE UPDATE ON public.telemedicine_appointments
FOR EACH ROW EXECUTE FUNCTION public.set_telemedicine_updated_at();

-- 7) RLS
ALTER TABLE public.telemedicine_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemedicine_events ENABLE ROW LEVEL SECURITY;

-- MVP: pacientes gerenciam suas próprias consultas.
DROP POLICY IF EXISTS "telemedicine_patient_manage_own" ON public.telemedicine_appointments;
CREATE POLICY "telemedicine_patient_manage_own" ON public.telemedicine_appointments
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = patient_id)
  WITH CHECK (auth.uid() = user_id OR auth.uid() = patient_id);

-- MVP: painel profissional/admin dentro do app pode gerenciar consultas.
-- Em produção, trocar por roles/professionals.
DROP POLICY IF EXISTS "telemedicine_admin_manage_mvp" ON public.telemedicine_appointments;
CREATE POLICY "telemedicine_admin_manage_mvp" ON public.telemedicine_appointments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "telemedicine_events_read_mvp" ON public.telemedicine_events;
CREATE POLICY "telemedicine_events_read_mvp" ON public.telemedicine_events
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "telemedicine_events_insert_mvp" ON public.telemedicine_events;
CREATE POLICY "telemedicine_events_insert_mvp" ON public.telemedicine_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 8) Realtime opcional
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.telemedicine_appointments;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.telemedicine_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Status principais:
-- requested: paciente pediu consulta
-- scheduled: profissional agendou e adicionou link
-- confirmed: paciente confirmou presença
-- reminder_sent: profissional mandou lembrete
-- in_progress: consulta iniciada
-- completed: consulta finalizada, com orientação/receita opcional
-- cancelled/no_show: cancelada ou ausência

-- Próxima fase:
-- payment_status / woovi_charge_id / pix_copy_paste serão usados pelo motor NextGen + Woovi.
-- SmartBots CRM usará telemedicine_events para lembretes, follow-up e relacionamento.
