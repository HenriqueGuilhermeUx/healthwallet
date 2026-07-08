-- =====================================================
-- HEALTHWALLET - FAMÍLIA / DEPENDENTES - PERFIL LIVRE V2
-- Execute no Supabase SQL Editor.
-- Objetivo: deixar explícito no banco que familiares/dependentes cadastrados
-- pelo usuário são perfis gerenciados diretamente no HealthWallet,
-- sem convite obrigatório, assinatura ou aceite.
-- =====================================================

ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS profile_mode TEXT DEFAULT 'managed_by_owner';
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS consent_required BOOLEAN DEFAULT false;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS signature_required BOOLEAN DEFAULT false;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS invitation_required BOOLEAN DEFAULT false;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS managed_by_owner BOOLEAN DEFAULT true;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS owner_declared_responsibility_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS data_entry_status TEXT DEFAULT 'active';

UPDATE public.family_members
SET profile_mode = COALESCE(profile_mode, 'managed_by_owner'),
    consent_required = false,
    signature_required = false,
    invitation_required = false,
    managed_by_owner = true,
    owner_declared_responsibility_at = COALESCE(owner_declared_responsibility_at, NOW()),
    data_entry_status = COALESCE(data_entry_status, 'active')
WHERE profile_mode IS NULL
   OR consent_required IS DISTINCT FROM false
   OR signature_required IS DISTINCT FROM false
   OR invitation_required IS DISTINCT FROM false;

CREATE INDEX IF NOT EXISTS idx_family_members_profile_mode ON public.family_members(profile_mode);
CREATE INDEX IF NOT EXISTS idx_family_members_managed_by_owner ON public.family_members(managed_by_owner);

-- Regra de produto:
-- - Familiar/dependente/pessoa cuidada: perfil livre, gerenciado pelo usuário dono da conta.
-- - Sem token, sem convite, sem assinatura, sem aceite obrigatório.
-- - Assinatura/aceite fica para documentos profissionais, ciência, consentimentos
--   ou autorizações externas quando necessário.
