-- =====================================================
-- HEALTH CONCIERGE - PILOT COMPATIBILITY V1
-- STAGING / PILOT ENVIRONMENT ONLY.
--
-- Purpose:
-- Normalize only the HealthWallet contracts that the Concierge patient
-- experience already expects but that may be missing in older databases.
-- This does not create Concierge tables and does not copy or seed patient data.
-- =====================================================

DO $$
BEGIN
  IF to_regclass('public.health_reminders') IS NULL THEN
    RAISE EXCEPTION 'HealthWallet compatibility failed: public.health_reminders is missing';
  END IF;

  IF to_regclass('public.family_members') IS NULL THEN
    RAISE EXCEPTION 'HealthWallet compatibility failed: public.family_members is missing';
  END IF;
END $$;

ALTER TABLE public.health_reminders
  ADD COLUMN IF NOT EXISTS target_family_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL;

ALTER TABLE public.health_reminders
  ADD COLUMN IF NOT EXISTS requires_confirmation BOOLEAN DEFAULT false;

ALTER TABLE public.health_reminders
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_health_reminders_target_family_member
  ON public.health_reminders(target_family_member_id);

DO $$
DECLARE
  missing_columns TEXT;
BEGIN
  WITH required(column_name) AS (
    VALUES ('target_family_member_id'), ('requires_confirmation'), ('updated_at')
  )
  SELECT string_agg(r.column_name, ', ' ORDER BY r.column_name)
    INTO missing_columns
  FROM required r
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'health_reminders'
      AND c.column_name = r.column_name
  );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'HealthWallet compatibility failed. Missing health_reminders columns: %', missing_columns;
  END IF;
END $$;

SELECT
  'PASS' AS concierge_pilot_compatibility,
  'Canonical health_reminders family-coordination fields are present.' AS message;
