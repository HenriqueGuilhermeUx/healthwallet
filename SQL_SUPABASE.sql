-- ============================================
-- HEALTHWALLET - SQL PARA SUPABASE
-- Copie TODO este código e cole no SQL Editor do Supabase
-- ============================================

-- PASSO 1: Criar tabelas
-- ============================================

-- Tabela de perfis de usuário
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  birth_date DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  blood_type TEXT,
  allergies TEXT[],
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de planos de saúde (carteirinhas)
CREATE TABLE public.health_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  plan_name TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('private', 'sus')),
  card_number TEXT NOT NULL,
  operator_name TEXT,
  beneficiary_name TEXT NOT NULL,
  validity TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de prontuários/exames
CREATE TABLE public.medical_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  file_url TEXT,
  file_name TEXT NOT NULL,
  exam_type TEXT,
  exam_date DATE,
  laboratory TEXT,
  extracted_data JSONB,
  ai_analysis TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de medicamentos
CREATE TABLE public.medications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de membros da família
CREATE TABLE public.family_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  birth_date DATE,
  blood_type TEXT,
  allergies TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PASSO 2: Habilitar segurança (RLS)
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

-- PASSO 3: Criar políticas de acesso
-- ============================================

-- Políticas para profiles
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Políticas para health_plans
CREATE POLICY "health_plans_select" ON public.health_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "health_plans_insert" ON public.health_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "health_plans_delete" ON public.health_plans FOR DELETE USING (auth.uid() = user_id);

-- Políticas para medical_records
CREATE POLICY "medical_records_select" ON public.medical_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "medical_records_insert" ON public.medical_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "medical_records_delete" ON public.medical_records FOR DELETE USING (auth.uid() = user_id);

-- Políticas para medications
CREATE POLICY "medications_select" ON public.medications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "medications_insert" ON public.medications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "medications_update" ON public.medications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "medications_delete" ON public.medications FOR DELETE USING (auth.uid() = user_id);

-- Políticas para family_members
CREATE POLICY "family_members_select" ON public.family_members FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "family_members_insert" ON public.family_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "family_members_update" ON public.family_members FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "family_members_delete" ON public.family_members FOR DELETE USING (auth.uid() = user_id);

-- PRONTO! Agora você pode ir para o Netlify.