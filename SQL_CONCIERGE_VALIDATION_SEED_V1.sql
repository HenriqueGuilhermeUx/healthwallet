-- =====================================================
-- HEALTH CONCIERGE - VALIDATION PERSONA SEED V1
-- VALIDATION ENVIRONMENT ONLY. NEVER RUN IN PRODUCTION.
--
-- Prerequisites:
-- 1) Apply every Concierge migration in HEALTH_CONCIERGE_VALIDATION.md.
-- 2) Run SQL_CONCIERGE_VALIDATION_PRECHECK_V1.sql and obtain PASS.
-- 3) Create the nine synthetic Auth users below in the validation Supabase project.
--
-- This script NEVER creates auth.users and NEVER touches users whose e-mail is not
-- one of the reserved @healthwallet.test validation identities below.
-- =====================================================

CREATE TEMP TABLE _concierge_validation_personas (
  code TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  user_id UUID,
  role TEXT,
  display_name TEXT
);

INSERT INTO _concierge_validation_personas (code, email, role, display_name)
VALUES
  ('patient_a',   'concierge.patient.a@healthwallet.test', NULL,               'Paciente A · com plano'),
  ('patient_b',   'concierge.patient.b@healthwallet.test', NULL,               'Paciente B · sem plano'),
  ('patient_c',   'concierge.patient.c@healthwallet.test', NULL,               'Paciente C · não inscrito'),
  ('nurse_a',     'concierge.nurse.a@healthwallet.test',   'nurse',            'Enfermeira A'),
  ('nurse_b',     'concierge.nurse.b@healthwallet.test',   'nurse',            'Enfermeira B'),
  ('doctor_a',    'concierge.doctor.a@healthwallet.test',  'doctor',           'Médico A'),
  ('doctor_b',    'concierge.doctor.b@healthwallet.test',  'doctor',           'Médico B'),
  ('coordinator', 'concierge.coord@healthwallet.test',     'care_coordinator', 'Coordenação Concierge'),
  ('admin',       'concierge.admin@healthwallet.test',     'admin',            'Admin Concierge');

UPDATE _concierge_validation_personas p
SET user_id = u.id
FROM auth.users u
WHERE lower(u.email) = lower(p.email);

DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(code || ' <' || email || '>', ', ' ORDER BY code)
    INTO missing
  FROM _concierge_validation_personas
  WHERE user_id IS NULL;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Create all synthetic Auth users before seeding. Missing: %', missing;
  END IF;
END $$;

-- Refuse to reset an environment after the E2E has started. This protects the
-- validation audit trail from accidental reseeding. Use a fresh validation project
-- or deliberately clean the synthetic records before re-running this seed.
DO $$
DECLARE
  used_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO used_count
  FROM public.concierge_requests r
  WHERE r.patient_id IN (
    SELECT user_id FROM _concierge_validation_personas WHERE code IN ('patient_a','patient_b','patient_c')
  );

  IF used_count > 0 THEN
    RAISE EXCEPTION 'Validation personas already have Concierge requests. Refusing to reseed a used E2E environment.';
  END IF;

  SELECT COUNT(*) INTO used_count
  FROM public.concierge_consent_events e
  WHERE e.patient_id IN (
    SELECT user_id FROM _concierge_validation_personas WHERE code IN ('patient_a','patient_b','patient_c')
  );

  IF used_count > 0 THEN
    RAISE EXCEPTION 'Validation personas already have consent audit events. Refusing to reseed a used E2E environment.';
  END IF;
END $$;

-- -----------------------------------------------------
-- Professional identities
-- -----------------------------------------------------
INSERT INTO public.concierge_staff (
  user_id,
  role,
  display_name,
  active,
  metadata
)
SELECT
  p.user_id,
  p.role,
  p.display_name,
  true,
  jsonb_build_object('validation_persona', p.code, 'synthetic', true)
FROM _concierge_validation_personas p
WHERE p.role IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name,
  active = true,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- -----------------------------------------------------
-- Patient A/B are enrolled; Patient C deliberately is not.
-- Consent remains PENDING so the UI consent flow itself is validated.
-- -----------------------------------------------------
INSERT INTO public.concierge_memberships (
  patient_id,
  status,
  plan_code,
  has_health_plan,
  pilot_cohort,
  consent_status,
  consent_version,
  consented_at,
  consent_revoked_at,
  metadata
)
SELECT
  p.user_id,
  'pilot',
  'concierge_validation',
  CASE p.code WHEN 'patient_a' THEN true ELSE false END,
  'validation_e2e_v1',
  'pending',
  NULL,
  NULL,
  NULL,
  jsonb_build_object(
    'validation_persona', p.code,
    'patient_name', p.display_name,
    'patient_email', p.email,
    'synthetic', true
  )
FROM _concierge_validation_personas p
WHERE p.code IN ('patient_a','patient_b')
ON CONFLICT (patient_id) DO UPDATE SET
  status = 'pilot',
  plan_code = EXCLUDED.plan_code,
  has_health_plan = EXCLUDED.has_health_plan,
  pilot_cohort = EXCLUDED.pilot_cohort,
  consent_status = 'pending',
  consent_version = NULL,
  consented_at = NULL,
  consent_revoked_at = NULL,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

DELETE FROM public.concierge_memberships
WHERE patient_id = (
  SELECT user_id FROM _concierge_validation_personas WHERE code = 'patient_c'
);

-- -----------------------------------------------------
-- Deterministic care teams.
-- Patient A -> Nurse A + Doctor A
-- Patient B -> Nurse B + Doctor B
-- -----------------------------------------------------
UPDATE public.concierge_assignments
SET status = 'ended',
    is_primary = false,
    ended_at = COALESCE(ended_at, NOW()),
    updated_at = NOW()
WHERE patient_id IN (
  SELECT user_id FROM _concierge_validation_personas WHERE code IN ('patient_a','patient_b')
)
  AND status = 'active';

WITH desired(patient_code, professional_code, assignment_role) AS (
  VALUES
    ('patient_a', 'nurse_a',  'nurse'),
    ('patient_a', 'doctor_a', 'doctor'),
    ('patient_b', 'nurse_b',  'nurse'),
    ('patient_b', 'doctor_b', 'doctor')
)
INSERT INTO public.concierge_assignments (
  patient_id,
  professional_id,
  role,
  is_primary,
  status,
  professional_name,
  started_at,
  ended_at,
  metadata
)
SELECT
  patient.user_id,
  professional.user_id,
  d.assignment_role,
  true,
  'active',
  professional.display_name,
  NOW(),
  NULL,
  jsonb_build_object('validation_seed', true, 'synthetic', true)
FROM desired d
JOIN _concierge_validation_personas patient ON patient.code = d.patient_code
JOIN _concierge_validation_personas professional ON professional.code = d.professional_code
ON CONFLICT (patient_id, professional_id, role) DO UPDATE SET
  is_primary = true,
  status = 'active',
  professional_name = EXCLUDED.professional_name,
  started_at = NOW(),
  ended_at = NULL,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- -----------------------------------------------------
-- Human-readable verification output
-- -----------------------------------------------------
SELECT
  p.code,
  p.email,
  p.user_id,
  COALESCE(s.role, 'patient') AS persona_role,
  m.status AS membership_status,
  m.consent_status,
  m.has_health_plan
FROM _concierge_validation_personas p
LEFT JOIN public.concierge_staff s ON s.user_id = p.user_id
LEFT JOIN public.concierge_memberships m ON m.patient_id = p.user_id
ORDER BY CASE p.code
  WHEN 'patient_a' THEN 1
  WHEN 'patient_b' THEN 2
  WHEN 'patient_c' THEN 3
  WHEN 'nurse_a' THEN 4
  WHEN 'nurse_b' THEN 5
  WHEN 'doctor_a' THEN 6
  WHEN 'doctor_b' THEN 7
  WHEN 'coordinator' THEN 8
  WHEN 'admin' THEN 9
  ELSE 99 END;

SELECT
  patient.email AS patient_email,
  a.role,
  professional.email AS professional_email,
  a.is_primary,
  a.status
FROM public.concierge_assignments a
JOIN _concierge_validation_personas patient ON patient.user_id = a.patient_id
JOIN _concierge_validation_personas professional ON professional.user_id = a.professional_id
WHERE a.status = 'active'
ORDER BY patient.email, a.role;

SELECT
  'PASS' AS validation_seed,
  'Synthetic Concierge personas and deterministic care teams are ready. Consent is intentionally still pending.' AS message;
