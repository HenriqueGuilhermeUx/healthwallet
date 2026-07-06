-- =====================================================
-- HEALTHWALLET FAMÍLIA & IDOSOS - FASE 1
-- Execute este arquivo no Supabase SQL Editor antes de usar as novas telas.
-- Recursos: Círculo de Cuidado, acesso master familiar, lembretes inteligentes,
-- confirmação de medicamento, estoque e botão SOS.
-- =====================================================

-- 1) Evoluir family_members para virar Círculo de Cuidado
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS member_type TEXT DEFAULT 'patient';
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS is_elderly BOOLEAN DEFAULT false;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS is_caregiver BOOLEAN DEFAULT false;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS master_access BOOLEAN DEFAULT false;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS emergency_contact BOOLEAN DEFAULT false;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS notify_medications BOOLEAN DEFAULT true;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS notify_appointments BOOLEAN DEFAULT true;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS notify_exams BOOLEAN DEFAULT true;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS notify_sos BOOLEAN DEFAULT true;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT DEFAULT 'whatsapp';
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS care_notes TEXT;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'family_members_member_type_check'
  ) THEN
    ALTER TABLE public.family_members
      ADD CONSTRAINT family_members_member_type_check
      CHECK (member_type IN ('patient', 'caregiver', 'relative', 'professional'));
  END IF;
END $$;

-- 2) Tabela para convites/acesso real entre contas no futuro
CREATE TABLE IF NOT EXISTS public.care_circle_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  member_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  family_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  member_name TEXT NOT NULL,
  member_email TEXT,
  member_phone TEXT,
  relationship TEXT,
  role TEXT DEFAULT 'relative' CHECK (role IN ('owner', 'master_family', 'caregiver', 'viewer', 'professional')),
  access_level TEXT DEFAULT 'master' CHECK (access_level IN ('master', 'care', 'emergency', 'read_only')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'invited', 'paused', 'revoked')),
  can_view_passport BOOLEAN DEFAULT true,
  can_view_exams BOOLEAN DEFAULT true,
  can_view_medications BOOLEAN DEFAULT true,
  can_view_timeline BOOLEAN DEFAULT true,
  can_view_medscore BOOLEAN DEFAULT true,
  can_receive_sos BOOLEAN DEFAULT true,
  can_receive_medication_alerts BOOLEAN DEFAULT true,
  can_receive_appointment_alerts BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.care_circle_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "care_circle_owner_manage" ON public.care_circle_members;
CREATE POLICY "care_circle_owner_manage" ON public.care_circle_members
  FOR ALL USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "care_circle_member_read" ON public.care_circle_members;
CREATE POLICY "care_circle_member_read" ON public.care_circle_members
  FOR SELECT USING (auth.uid() = member_user_id);

CREATE INDEX IF NOT EXISTS idx_care_circle_owner ON public.care_circle_members(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_care_circle_member_user ON public.care_circle_members(member_user_id);

-- 3) Evoluir medicamentos para cuidado familiar, estoque e confirmação
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS target_family_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS target_name TEXT DEFAULT 'Eu';
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS reminder_time TIME;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS notify_caregivers BOOLEAN DEFAULT false;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS critical_medication BOOLEAN DEFAULT false;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS stock_quantity INTEGER;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS pills_per_day NUMERIC;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS stock_alert_threshold INTEGER DEFAULT 5;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS last_taken_at TIMESTAMPTZ;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_medications_target_family_member ON public.medications(target_family_member_id);

-- 4) Lembretes gerais de saúde, caso ainda não exista
CREATE TABLE IF NOT EXISTS public.health_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  target_family_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  type TEXT DEFAULT 'general',
  title TEXT NOT NULL,
  description TEXT,
  reminder_date DATE NOT NULL,
  reminder_time TIME,
  frequency TEXT DEFAULT 'once',
  requires_confirmation BOOLEAN DEFAULT false,
  is_done BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.health_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "health_reminders_manage_own" ON public.health_reminders;
CREATE POLICY "health_reminders_manage_own" ON public.health_reminders
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_health_reminders_user_date ON public.health_reminders(user_id, reminder_date);

-- 5) Confirmação de medicamentos: Tomei / adiei / pulei / esqueci
CREATE TABLE IF NOT EXISTS public.medication_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  medication_id UUID REFERENCES public.medications(id) ON DELETE CASCADE NOT NULL,
  target_family_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'taken' CHECK (status IN ('taken', 'delayed', 'skipped', 'missed')),
  notes TEXT,
  confirmed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.medication_confirmations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "medication_confirmations_manage_own" ON public.medication_confirmations;
CREATE POLICY "medication_confirmations_manage_own" ON public.medication_confirmations
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_med_confirmations_user ON public.medication_confirmations(user_id);
CREATE INDEX IF NOT EXISTS idx_med_confirmations_medication ON public.medication_confirmations(medication_id);

-- 6) Contatos de emergência estruturados
CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  family_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  relationship TEXT,
  phone TEXT,
  email TEXT,
  is_primary BOOLEAN DEFAULT false,
  can_receive_sos BOOLEAN DEFAULT true,
  can_receive_medication_alerts BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "emergency_contacts_manage_own" ON public.emergency_contacts;
CREATE POLICY "emergency_contacts_manage_own" ON public.emergency_contacts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_user ON public.emergency_contacts(user_id);

-- 7) Eventos SOS
CREATE TABLE IF NOT EXISTS public.sos_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  target_family_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  triggered_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'false_alarm')),
  message TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  address TEXT,
  notified_contacts JSONB DEFAULT '[]'::jsonb,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sos_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sos_events_manage_own" ON public.sos_events;
CREATE POLICY "sos_events_manage_own" ON public.sos_events
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sos_events_user_status ON public.sos_events(user_id, status);

-- 8) Notas de cuidado / plantão simples para evoluir depois
CREATE TABLE IF NOT EXISTS public.care_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  target_family_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  note_type TEXT DEFAULT 'general' CHECK (note_type IN ('general', 'shift', 'symptom', 'medication', 'appointment', 'incident')),
  title TEXT NOT NULL,
  content TEXT,
  visibility TEXT DEFAULT 'family' CHECK (visibility IN ('private', 'family', 'professional')),
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.care_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "care_notes_manage_own" ON public.care_notes;
CREATE POLICY "care_notes_manage_own" ON public.care_notes
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_care_notes_user ON public.care_notes(user_id);

-- 9) Realtime opcional
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.medication_confirmations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.health_reminders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- FIM
