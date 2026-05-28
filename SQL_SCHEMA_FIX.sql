-- ================================================
-- Corrigir Schema do HealthWallet App
-- Execute este SQL no Supabase SQL Editor
-- ================================================

-- 1. Adicionar colunas que faltam na tabela profiles (onboarding completo)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS blood_type TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weight INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS height INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS smoking_status TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS alcohol_consumption TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS physical_activity TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sleep_hours INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stress_level TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS chronic_conditions TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS family_history TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_medications TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS med_score INTEGER DEFAULT 0;

-- Adicionar comentário às colunas
COMMENT ON COLUMN public.profiles.blood_type IS 'Tipo sanguíneo do usuário';
COMMENT ON COLUMN public.profiles.weight IS 'Peso em kg';
COMMENT ON COLUMN public.profiles.height IS 'Altura em cm';
COMMENT ON COLUMN public.profiles.phone IS 'Telefone de contato';
COMMENT ON COLUMN public.profiles.allergies IS 'Lista de alergias';
COMMENT ON COLUMN public.profiles.smoking_status IS 'Status de tabagismo';
COMMENT ON COLUMN public.profiles.alcohol_consumption IS 'Consumo de álcool';
COMMENT ON COLUMN public.profiles.physical_activity IS 'Nível de atividade física';
COMMENT ON COLUMN public.profiles.sleep_hours IS 'Horas de sono';
COMMENT ON COLUMN public.profiles.stress_level IS 'Nível de estresse';
COMMENT ON COLUMN public.profiles.chronic_conditions IS 'Condições crônicas';
COMMENT ON COLUMN public.profiles.family_history IS 'Histórico médico familiar';
COMMENT ON COLUMN public.profiles.current_medications IS 'Medicamentos em uso';
COMMENT ON COLUMN public.profiles.med_score IS 'Pontuação de saúde (MedScore)';

-- 2. Criar tabela de consentimento LGPD
CREATE TABLE IF NOT EXISTS public.consent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('terms', 'privacy', 'data_usage')),
  consent_version TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  accepted_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS para consent_logs
ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own consent" ON public.consent_logs;
CREATE POLICY "Users can insert own consent" ON public.consent_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own consent" ON public.consent_logs;
CREATE POLICY "Users can view own consent" ON public.consent_logs
  FOR SELECT USING (auth.uid() = user_id);

-- 3. Criar tabela de códigos de acesso (QR Code sharing)
CREATE TABLE IF NOT EXISTS public.access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para access_codes
CREATE INDEX IF NOT EXISTS idx_access_codes_code ON public.access_codes(code);
CREATE INDEX IF NOT EXISTS idx_access_codes_patient ON public.access_codes(patient_id);

-- RLS para access_codes
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active access codes" ON public.access_codes;
CREATE POLICY "Anyone can read active access codes" ON public.access_codes
  FOR SELECT USING (expires_at > NOW());

DROP POLICY IF EXISTS "Patients can manage own access codes" ON public.access_codes;
CREATE POLICY "Patients can manage own access codes" ON public.access_codes
  FOR ALL USING (auth.uid() = patient_id);

-- 4. Criar/Atualizar trigger para criar profile automaticamente após signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, birth_date)
  VALUES (NEW.id, NULL)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Criar tabela de notificações
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS para notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own notifications" ON public.notifications;
CREATE POLICY "Users can manage own notifications" ON public.notifications
  FOR ALL USING (auth.uid() = user_id);

-- Habilitar realtime para notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.access_codes;
