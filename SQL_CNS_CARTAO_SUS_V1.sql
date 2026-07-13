-- =====================================================
-- HEALTHWALLET - CNS / CARTÃO SUS V1
-- Execute no Supabase SQL Editor.
-- Objetivo: permitir vínculo operacional complementar com Cartão SUS/CNS,
-- sem prometer integração oficial automática com DATASUS/RNDS nesta fase.
-- =====================================================

-- Perfil principal do cidadão/paciente
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cns_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sus_card_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sus_municipality TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sus_ubs_reference TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sus_family_health_team TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sus_local_record_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sus_metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_profiles_cpf ON public.profiles(cpf);
CREATE INDEX IF NOT EXISTS idx_profiles_cns_number ON public.profiles(cns_number);
CREATE INDEX IF NOT EXISTS idx_profiles_sus_card_number ON public.profiles(sus_card_number);
CREATE INDEX IF NOT EXISTS idx_profiles_sus_municipality ON public.profiles(sus_municipality);
CREATE INDEX IF NOT EXISTS idx_profiles_sus_ubs_reference ON public.profiles(sus_ubs_reference);

-- Familiares/dependentes/pessoas cuidadas
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS cns_number TEXT;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS sus_card_number TEXT;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS sus_municipality TEXT;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS sus_ubs_reference TEXT;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS sus_family_health_team TEXT;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS sus_local_record_number TEXT;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS sus_metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_family_members_cpf ON public.family_members(cpf);
CREATE INDEX IF NOT EXISTS idx_family_members_cns_number ON public.family_members(cns_number);
CREATE INDEX IF NOT EXISTS idx_family_members_sus_card_number ON public.family_members(sus_card_number);
CREATE INDEX IF NOT EXISTS idx_family_members_sus_municipality ON public.family_members(sus_municipality);
CREATE INDEX IF NOT EXISTS idx_family_members_sus_ubs_reference ON public.family_members(sus_ubs_reference);

-- Compartilhamentos com metadados de identificação informados pelo cidadão.
ALTER TABLE public.access_codes ADD COLUMN IF NOT EXISTS patient_cpf TEXT;
ALTER TABLE public.access_codes ADD COLUMN IF NOT EXISTS patient_cns_number TEXT;
ALTER TABLE public.access_codes ADD COLUMN IF NOT EXISTS patient_sus_card_number TEXT;
ALTER TABLE public.access_codes ADD COLUMN IF NOT EXISTS patient_sus_municipality TEXT;
ALTER TABLE public.access_codes ADD COLUMN IF NOT EXISTS patient_sus_ubs_reference TEXT;

CREATE INDEX IF NOT EXISTS idx_access_codes_patient_cpf ON public.access_codes(patient_cpf);
CREATE INDEX IF NOT EXISTS idx_access_codes_patient_cns_number ON public.access_codes(patient_cns_number);
CREATE INDEX IF NOT EXISTS idx_access_codes_patient_sus_card_number ON public.access_codes(patient_sus_card_number);

-- Regra de produto:
-- - CNS/Cartão SUS é informado pelo cidadão, familiar, responsável ou município.
-- - É uma ponte operacional complementar para organização local.
-- - Não significa integração oficial automática com DATASUS/RNDS nesta fase.
-- - Acesso profissional continua dependente de autorização/código/consulta.
