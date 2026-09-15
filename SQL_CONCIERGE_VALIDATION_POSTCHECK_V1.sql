-- =====================================================
-- HEALTH CONCIERGE - CANONICAL E2E POSTCHECK V1
-- VALIDATION ENVIRONMENT ONLY.
-- Run ONLY after completing HEALTH_CONCIERGE_E2E_RUNBOOK.md.
--
-- Expected final state from the canonical runbook:
-- - Patient A accepted consent, completed the care loop, then revoked consent.
-- - Patient B accepted consent and generated routine utilization without a health plan.
-- - Patient C remained outside Concierge.
-- - Patient A latest request routed Nurse A -> Doctor A.
-- =====================================================

DO $$
DECLARE
  patient_a UUID;
  patient_b UUID;
  patient_c UUID;
  nurse_a UUID;
  doctor_a UUID;
  latest_request UUID;
  latest_nurse UUID;
  latest_doctor UUID;
  failures TEXT[] := ARRAY[]::TEXT[];
  count_value INTEGER;
  status_value TEXT;
  bool_value BOOLEAN;
BEGIN
  SELECT id INTO patient_a FROM auth.users WHERE lower(email) = 'concierge.patient.a@healthwallet.test';
  SELECT id INTO patient_b FROM auth.users WHERE lower(email) = 'concierge.patient.b@healthwallet.test';
  SELECT id INTO patient_c FROM auth.users WHERE lower(email) = 'concierge.patient.c@healthwallet.test';
  SELECT id INTO nurse_a FROM auth.users WHERE lower(email) = 'concierge.nurse.a@healthwallet.test';
  SELECT id INTO doctor_a FROM auth.users WHERE lower(email) = 'concierge.doctor.a@healthwallet.test';

  IF patient_a IS NULL OR patient_b IS NULL OR patient_c IS NULL OR nurse_a IS NULL OR doctor_a IS NULL THEN
    RAISE EXCEPTION 'Canonical validation personas are missing. Run the seed prerequisites first.';
  END IF;

  -- Patient A must finish the canonical test in revoked state.
  SELECT m.consent_status INTO status_value
  FROM public.concierge_memberships m
  WHERE m.patient_id = patient_a;

  IF status_value IS DISTINCT FROM 'revoked' THEN
    failures := array_append(failures, 'Patient A final consent_status must be revoked');
  END IF;

  SELECT COUNT(*) INTO count_value
  FROM public.concierge_consent_events e
  WHERE e.patient_id = patient_a AND e.event_type = 'accepted';
  IF count_value < 1 THEN failures := array_append(failures, 'Patient A missing accepted consent audit event'); END IF;

  SELECT COUNT(*) INTO count_value
  FROM public.concierge_consent_events e
  WHERE e.patient_id = patient_a AND e.event_type = 'revoked';
  IF count_value < 1 THEN failures := array_append(failures, 'Patient A missing revoked consent audit event'); END IF;

  -- Patient C must remain unenrolled.
  SELECT COUNT(*) INTO count_value
  FROM public.concierge_memberships m
  WHERE m.patient_id = patient_c;
  IF count_value <> 0 THEN failures := array_append(failures, 'Patient C unexpectedly has Concierge membership'); END IF;

  -- Patient B must prove the no-health-plan segment.
  SELECT m.has_health_plan, m.consent_status
    INTO bool_value, status_value
  FROM public.concierge_memberships m
  WHERE m.patient_id = patient_b;

  IF bool_value IS DISTINCT FROM false THEN
    failures := array_append(failures, 'Patient B must remain has_health_plan=false');
  END IF;
  IF status_value IS DISTINCT FROM 'accepted' THEN
    failures := array_append(failures, 'Patient B consent must be accepted for segment validation');
  END IF;

  SELECT COUNT(*) INTO count_value
  FROM public.concierge_requests r
  WHERE r.patient_id = patient_b;
  IF count_value < 1 THEN failures := array_append(failures, 'Patient B needs at least one Concierge request'); END IF;

  -- Resolve Patient A canonical request and verify reference-team routing.
  SELECT r.id, r.assigned_nurse_id, r.assigned_doctor_id
    INTO latest_request, latest_nurse, latest_doctor
  FROM public.concierge_requests r
  WHERE r.patient_id = patient_a
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF latest_request IS NULL THEN
    failures := array_append(failures, 'Patient A has no canonical E2E request');
  ELSE
    IF latest_nurse IS DISTINCT FROM nurse_a THEN
      failures := array_append(failures, 'Patient A latest request did not remain routed to Nurse A');
    END IF;
    IF latest_doctor IS DISTINCT FROM doctor_a THEN
      failures := array_append(failures, 'Patient A medical escalation did not route to Doctor A');
    END IF;

    SELECT COUNT(*) INTO count_value
    FROM public.concierge_requests r
    WHERE r.id = latest_request
      AND r.first_response_at IS NOT NULL;
    IF count_value <> 1 THEN failures := array_append(failures, 'Patient A canonical request missing first_response_at'); END IF;

    SELECT COUNT(*) INTO count_value
    FROM public.concierge_request_events e
    WHERE e.request_id = latest_request
      AND e.actor_role = 'patient'
      AND e.event_type = 'patient_message';
    IF count_value < 1 THEN failures := array_append(failures, 'Patient A canonical request missing patient reply event'); END IF;

    SELECT COUNT(*) INTO count_value
    FROM public.concierge_context_access_logs l
    WHERE l.request_id = latest_request;
    IF count_value < 1 THEN failures := array_append(failures, 'Patient A canonical request missing authorized-context access audit'); END IF;

    SELECT COUNT(*) INTO count_value
    FROM public.concierge_clinical_reviews cr
    WHERE cr.request_id = latest_request
      AND cr.status = 'completed'
      AND cr.patient_visible = true;
    IF count_value < 1 THEN failures := array_append(failures, 'Patient A canonical request missing completed patient-visible physician review'); END IF;

    SELECT COUNT(*) INTO count_value
    FROM public.concierge_actions a
    WHERE a.request_id = latest_request;
    IF count_value < 1 THEN failures := array_append(failures, 'Patient A canonical request missing action-plan item'); END IF;
  END IF;

  -- Workload instrumentation must have both nursing and physician evidence for A.
  SELECT COUNT(*) INTO count_value
  FROM public.concierge_work_logs w
  WHERE w.patient_id = patient_a
    AND w.staff_role IN ('nurse','care_coordinator');
  IF count_value < 1 THEN failures := array_append(failures, 'Patient A missing nursing/care-coordination work log'); END IF;

  SELECT COUNT(*) INTO count_value
  FROM public.concierge_work_logs w
  WHERE w.patient_id = patient_a
    AND w.staff_role = 'doctor';
  IF count_value < 1 THEN failures := array_append(failures, 'Patient A missing physician work log'); END IF;

  -- Revocation should close/dismiss outstanding proactive workflow alerts for A.
  SELECT COUNT(*) INTO count_value
  FROM public.concierge_alerts a
  WHERE a.patient_id = patient_a
    AND a.status = 'open';
  IF count_value > 0 THEN failures := array_append(failures, 'Patient A still has open Concierge alerts after consent revocation'); END IF;

  -- Patient B should also produce human-work evidence for segment instrumentation.
  SELECT COUNT(*) INTO count_value
  FROM public.concierge_work_logs w
  WHERE w.patient_id = patient_b;
  IF count_value < 1 THEN failures := array_append(failures, 'Patient B missing work-log evidence for plan segmentation'); END IF;

  -- Automation queue must not contain obvious raw health text fields for canonical requests.
  IF to_regclass('public.automation_events') IS NOT NULL THEN
    SELECT COUNT(*) INTO count_value
    FROM public.automation_events ae
    WHERE ae.patient_id IN (patient_a, patient_b)
      AND (
        ae.payload ? 'message'
        OR ae.payload ? 'description'
        OR ae.payload ? 'raw_text'
        OR ae.payload ? 'health_text'
      );
    IF count_value > 0 THEN failures := array_append(failures, 'Automation event payload contains raw narrative-like fields'); END IF;
  END IF;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION 'Concierge canonical E2E postcheck failed: %', array_to_string(failures, ' | ');
  END IF;
END $$;

SELECT
  'PASS' AS canonical_e2e_postcheck,
  NOW() AS checked_at,
  'Reference-team routing, consent lifecycle, audit, clinical review and pilot instrumentation match the canonical validation runbook.' AS message;
