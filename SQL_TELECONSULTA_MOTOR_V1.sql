-- =====================================================
-- HEALTHWALLET / MYDATAMED - MOTOR DE TELECONSULTA V1
-- Execute no Supabase SQL Editor.
-- Objetivo: agenda profissional, confirmação do paciente, compartilhamento por evento,
-- link de chamada, lembrete, início/fim da consulta e registro de orientação/receita.
-- =====================================================

-- 1) Garantir tabela principal compatível com o que já existe
CREATE TABLE IF NOT EXISTS public.telemedicine_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  clinic_id UUID,
  patient_name TEXT,
  patient_email TEXT,
  professional_name TEXT,
  specialty TEXT DEFAULT 'Clínica geral',
  reason TEXT,
  preferred_date DATE,
  preferred_time TIME,
  duration_minutes INTEGER DEFAULT 30,
  status TEXT DEFAULT 'requested',
  provider TEXT DEFAULT 'manual_link',
  room_url TEXT,
  meet_url TEXT,
  google_calendar_event_id TEXT,
  patient_confirmed BOOLEAN DEFAULT false,
  patient_confirmed_at TIMESTAMPTZ,
  data_sharing_authorized BOOLEAN DEFAULT false,
  data_sharing_authorized_at TIMESTAMPTZ,
  shared_data_permissions JSONB DEFAULT '{"summary":true,"exams":true,"medications":true,"timeline":true,"passport":true,"medscore":true}'::jsonb,
  reminder_sent_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  professional_notes TEXT,
  prescription_text TEXT,
  orientation_text TEXT,
  payment_status TEXT DEFAULT 'not_required',
  payment_amount_cents INTEGER,
  payment_provider TEXT,
  payment_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Evoluir tabela existente caso já tenha sido criada antes
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS clinic_id UUID;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS patient_name TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS patient_email TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS professional_name TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS specialty TEXT DEFAULT 'Clínica geral';
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS preferred_date DATE;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS preferred_time TIME;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 30;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'requested';
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'manual_link';
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS room_url TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS meet_url TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS patient_confirmed BOOLEAN DEFAULT false;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS patient_confirmed_at TIMESTAMPTZ;
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
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'not_required';
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS payment_amount_cents INTEGER;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS payment_provider TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.telemedicine_appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3) Sincronizar patient_id e user_id para compatibilidade entre HealthWallet e MyDataMed
UPDATE public.telemedicine_appointments
SET patient_id = COALESCE(patient_id, user_id),
    user_id = COALESCE(user_id, patient_id)
WHERE patient_id IS NULL OR user_id IS NULL;

-- 4) Logs/eventos da consulta
CREATE TABLE IF NOT EXISTS public.telemedicine_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.telemedicine_appointments(id) ON DELETE CASCADE NOT NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.telemedicine_events ENABLE ROW LEVEL SECURITY;

-- 5) Índices
CREATE INDEX IF NOT EXISTS idx_telemedicine_patient ON public.telemedicine_appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_telemedicine_user ON public.telemedicine_appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_telemedicine_professional ON public.telemedicine_appointments(professional_id);
CREATE INDEX IF NOT EXISTS idx_telemedicine_status ON public.telemedicine_appointments(status);
CREATE INDEX IF NOT EXISTS idx_telemedicine_date ON public.telemedicine_appointments(preferred_date, preferred_time);
CREATE INDEX IF NOT EXISTS idx_telemedicine_events_appointment ON public.telemedicine_events(appointment_id);

-- 6) RLS
ALTER TABLE public.telemedicine_appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telemedicine_patient_manage_own" ON public.telemedicine_appointments;
CREATE POLICY "telemedicine_patient_manage_own" ON public.telemedicine_appointments
  FOR ALL USING (auth.uid() = user_id OR auth.uid() = patient_id)
  WITH CHECK (auth.uid() = user_id OR auth.uid() = patient_id);

DROP POLICY IF EXISTS "telemedicine_professional_manage_own" ON public.telemedicine_appointments;
CREATE POLICY "telemedicine_professional_manage_own" ON public.telemedicine_appointments
  FOR ALL USING (
    professional_id IN (
      SELECT id FROM public.professionals WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    professional_id IN (
      SELECT id FROM public.professionals WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "telemedicine_events_patient_read" ON public.telemedicine_events;
CREATE POLICY "telemedicine_events_patient_read" ON public.telemedicine_events
  FOR SELECT USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "telemedicine_events_professional_manage" ON public.telemedicine_events;
CREATE POLICY "telemedicine_events_professional_manage" ON public.telemedicine_events
  FOR ALL USING (
    professional_id IN (
      SELECT id FROM public.professionals WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    professional_id IN (
      SELECT id FROM public.professionals WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "telemedicine_events_patient_insert" ON public.telemedicine_events;
CREATE POLICY "telemedicine_events_patient_insert" ON public.telemedicine_events
  FOR INSERT WITH CHECK (patient_id = auth.uid() OR actor_user_id = auth.uid());

-- 7) Realtime opcional
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

-- FIM
