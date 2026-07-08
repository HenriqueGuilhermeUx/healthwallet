-- =====================================================
-- HEALTHWALLET / MYDATAMED - TELECONSULTA V2
-- Fundação para CRM SmartBots + Pagamentos NextGen/Woovi
-- Execute depois do SQL_TELECONSULTA_MOTOR_V1.sql.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Planos profissionais
CREATE TABLE IF NOT EXISTS public.professional_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_email TEXT,
  professional_name TEXT,
  clinic_name TEXT,
  plan_name TEXT DEFAULT 'MyDataMed Pro',
  plan_price_cents INTEGER DEFAULT 7990,
  billing_cycle TEXT DEFAULT 'monthly',
  status TEXT DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'blocked')),
  trial_ends_at TIMESTAMPTZ,
  current_period_starts_at TIMESTAMPTZ,
  current_period_ends_at TIMESTAMPTZ,
  payment_provider TEXT DEFAULT 'woovi',
  provider_customer_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Cobranças de consultas / mensalidade / Pix
CREATE TABLE IF NOT EXISTS public.professional_payment_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.telemedicine_appointments(id) ON DELETE SET NULL,
  professional_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_email TEXT,
  charge_type TEXT DEFAULT 'teleconsultation'
    CHECK (charge_type IN ('subscription', 'teleconsultation', 'document', 'other')),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  platform_fee_cents INTEGER DEFAULT 0,
  professional_net_cents INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft', 'pix_generated', 'waiting_payment', 'paid', 'expired', 'cancelled', 'refunded', 'split_pending', 'split_done')),
  provider TEXT DEFAULT 'woovi',
  provider_charge_id TEXT,
  pix_qr_code TEXT,
  pix_copy_paste TEXT,
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  split_paid_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) CRM simples para profissionais
CREATE TABLE IF NOT EXISTS public.professional_crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_name TEXT,
  patient_email TEXT,
  patient_phone TEXT,
  source TEXT DEFAULT 'telemedicine'
    CHECK (source IN ('telemedicine', 'healthwallet', 'manual', 'smartbots', 'import')),
  lifecycle_stage TEXT DEFAULT 'patient'
    CHECK (lifecycle_stage IN ('lead', 'patient', 'follow_up', 'inactive', 'archived')),
  last_contact_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  notes TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4) Tarefas e automações SmartBots CRM
CREATE TABLE IF NOT EXISTS public.professional_crm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.professional_crm_contacts(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.telemedicine_appointments(id) ON DELETE SET NULL,
  task_type TEXT DEFAULT 'follow_up'
    CHECK (task_type IN ('reminder', 'follow_up', 'post_consultation', 'payment', 'document', 'manual')),
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'cancelled', 'failed')),
  channel TEXT DEFAULT 'manual'
    CHECK (channel IN ('manual', 'email', 'whatsapp', 'app', 'sms')),
  message_template TEXT,
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5) Templates de mensagens para lembretes e relacionamento
CREATE TABLE IF NOT EXISTS public.professional_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_type TEXT DEFAULT 'reminder'
    CHECK (template_type IN ('reminder', 'confirmation', 'post_consultation', 'payment', 'document', 'marketing')),
  channel TEXT DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp', 'email', 'app', 'sms')),
  body TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6) Índices
CREATE INDEX IF NOT EXISTS idx_prof_sub_user ON public.professional_subscriptions(professional_user_id);
CREATE INDEX IF NOT EXISTS idx_prof_charges_professional ON public.professional_payment_charges(professional_user_id);
CREATE INDEX IF NOT EXISTS idx_prof_charges_patient ON public.professional_payment_charges(patient_id);
CREATE INDEX IF NOT EXISTS idx_prof_charges_appointment ON public.professional_payment_charges(appointment_id);
CREATE INDEX IF NOT EXISTS idx_prof_crm_contacts_professional ON public.professional_crm_contacts(professional_user_id);
CREATE INDEX IF NOT EXISTS idx_prof_crm_contacts_patient ON public.professional_crm_contacts(patient_id);
CREATE INDEX IF NOT EXISTS idx_prof_crm_tasks_professional ON public.professional_crm_tasks(professional_user_id);
CREATE INDEX IF NOT EXISTS idx_prof_crm_tasks_due ON public.professional_crm_tasks(due_at, status);
CREATE INDEX IF NOT EXISTS idx_prof_templates_professional ON public.professional_message_templates(professional_user_id);

-- 7) updated_at automático reutilizável
CREATE OR REPLACE FUNCTION public.set_updated_at_generic()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_professional_subscriptions_updated_at ON public.professional_subscriptions;
CREATE TRIGGER trg_professional_subscriptions_updated_at
BEFORE UPDATE ON public.professional_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

DROP TRIGGER IF EXISTS trg_professional_payment_charges_updated_at ON public.professional_payment_charges;
CREATE TRIGGER trg_professional_payment_charges_updated_at
BEFORE UPDATE ON public.professional_payment_charges
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

DROP TRIGGER IF EXISTS trg_professional_crm_contacts_updated_at ON public.professional_crm_contacts;
CREATE TRIGGER trg_professional_crm_contacts_updated_at
BEFORE UPDATE ON public.professional_crm_contacts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

DROP TRIGGER IF EXISTS trg_professional_crm_tasks_updated_at ON public.professional_crm_tasks;
CREATE TRIGGER trg_professional_crm_tasks_updated_at
BEFORE UPDATE ON public.professional_crm_tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

DROP TRIGGER IF EXISTS trg_professional_message_templates_updated_at ON public.professional_message_templates;
CREATE TRIGGER trg_professional_message_templates_updated_at
BEFORE UPDATE ON public.professional_message_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

-- 8) RLS MVP
ALTER TABLE public.professional_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_payment_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "professional_subscriptions_manage_own" ON public.professional_subscriptions;
CREATE POLICY "professional_subscriptions_manage_own" ON public.professional_subscriptions
  FOR ALL TO authenticated
  USING (professional_user_id = auth.uid())
  WITH CHECK (professional_user_id = auth.uid());

DROP POLICY IF EXISTS "professional_payment_charges_mvp" ON public.professional_payment_charges;
CREATE POLICY "professional_payment_charges_mvp" ON public.professional_payment_charges
  FOR ALL TO authenticated
  USING (professional_user_id = auth.uid() OR patient_id = auth.uid())
  WITH CHECK (professional_user_id = auth.uid() OR patient_id = auth.uid() OR professional_user_id IS NULL);

DROP POLICY IF EXISTS "professional_crm_contacts_manage_own" ON public.professional_crm_contacts;
CREATE POLICY "professional_crm_contacts_manage_own" ON public.professional_crm_contacts
  FOR ALL TO authenticated
  USING (professional_user_id = auth.uid())
  WITH CHECK (professional_user_id = auth.uid());

DROP POLICY IF EXISTS "professional_crm_tasks_manage_own" ON public.professional_crm_tasks;
CREATE POLICY "professional_crm_tasks_manage_own" ON public.professional_crm_tasks
  FOR ALL TO authenticated
  USING (professional_user_id = auth.uid())
  WITH CHECK (professional_user_id = auth.uid());

DROP POLICY IF EXISTS "professional_message_templates_manage_own" ON public.professional_message_templates;
CREATE POLICY "professional_message_templates_manage_own" ON public.professional_message_templates
  FOR ALL TO authenticated
  USING (professional_user_id = auth.uid())
  WITH CHECK (professional_user_id = auth.uid());

-- 9) Templates padrão que podem ser copiados para o profissional depois
CREATE TABLE IF NOT EXISTS public.system_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  template_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.system_message_templates (name, template_type, channel, body)
SELECT 'Lembrete de teleconsulta', 'reminder', 'whatsapp',
'Olá, {{patient_name}}. Passando para lembrar da sua teleconsulta com {{professional_name}} em {{date}} às {{time}}. Acesse o HealthWallet para confirmar presença, autorizar os dados e entrar na chamada.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_message_templates WHERE name = 'Lembrete de teleconsulta'
);

INSERT INTO public.system_message_templates (name, template_type, channel, body)
SELECT 'Pós-consulta', 'post_consultation', 'whatsapp',
'Olá, {{patient_name}}. Suas orientações da consulta já estão disponíveis no HealthWallet. Acesse o app para visualizar a receita, recomendações e próximos passos.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_message_templates WHERE name = 'Pós-consulta'
);

-- FIM
