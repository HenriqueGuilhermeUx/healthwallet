-- ============================================================
-- HEALTHWALLET / MYDATAMED
-- TELEMEDICINE RLS HARDENING V2
-- Replaces insecure MVP policies with patient/professional/staff ownership.
-- ============================================================

BEGIN;

-- Compatibility guard.
DO $$
DECLARE
  missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF to_regclass('public.telemedicine_appointments') IS NULL THEN
    missing := array_append(missing, 'telemedicine_appointments');
  END IF;
  IF to_regclass('public.telemedicine_events') IS NULL THEN
    missing := array_append(missing, 'telemedicine_events');
  END IF;
  IF to_regclass('public.professionals') IS NULL THEN
    missing := array_append(missing, 'professionals');
  END IF;
  IF to_regprocedure('private.concierge_operations_is_staff(uuid)') IS NULL THEN
    missing := array_append(missing, 'private.concierge_operations_is_staff(uuid)');
  END IF;

  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'Telemedicine hardening preflight failed: %',
      array_to_string(missing, ', ');
  END IF;
END $$;

-- Professional ownership helper.
CREATE OR REPLACE FUNCTION private.telemedicine_professional_owns(
  p_user UUID,
  p_professional_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_user IS NOT NULL
    AND p_professional_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.user_id = p_user
        AND p.id = p_professional_id
    );
$$;

CREATE OR REPLACE FUNCTION private.telemedicine_is_professional_user(
  p_user UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_user IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.user_id = p_user
    );
$$;

CREATE OR REPLACE FUNCTION private.telemedicine_can_access_appointment(
  p_appointment_id UUID,
  p_user UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.telemedicine_appointments a
    WHERE a.id = p_appointment_id
      AND (
        a.user_id = p_user
        OR a.patient_id = p_user
        OR private.telemedicine_professional_owns(p_user, a.professional_id)
        OR private.concierge_operations_is_staff(p_user)
      )
  );
$$;

REVOKE ALL ON FUNCTION private.telemedicine_professional_owns(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.telemedicine_is_professional_user(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.telemedicine_can_access_appointment(UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.telemedicine_professional_owns(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.telemedicine_is_professional_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.telemedicine_can_access_appointment(UUID, UUID) TO authenticated;

-- Remove legacy/MVP policies.
DROP POLICY IF EXISTS "Admin delete telemedicine appointments" ON public.telemedicine_appointments;
DROP POLICY IF EXISTS "Admin insert telemedicine appointments" ON public.telemedicine_appointments;
DROP POLICY IF EXISTS "Admin update telemedicine appointments" ON public.telemedicine_appointments;
DROP POLICY IF EXISTS "Admin view telemedicine appointments" ON public.telemedicine_appointments;
DROP POLICY IF EXISTS "Users manage own telemedicine appointments" ON public.telemedicine_appointments;
DROP POLICY IF EXISTS "telemedicine_admin_manage_mvp" ON public.telemedicine_appointments;
DROP POLICY IF EXISTS "telemedicine_patient_manage_own" ON public.telemedicine_appointments;

DROP POLICY IF EXISTS "telemedicine_events_read_mvp" ON public.telemedicine_events;
DROP POLICY IF EXISTS "telemedicine_events_insert_mvp" ON public.telemedicine_events;

-- One policy per command to avoid permissive-policy fanout.
CREATE POLICY telemedicine_appointments_select_v2
ON public.telemedicine_appointments
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR patient_id = (SELECT auth.uid())
  OR private.telemedicine_professional_owns((SELECT auth.uid()), professional_id)
  OR private.concierge_operations_is_staff((SELECT auth.uid()))
);

CREATE POLICY telemedicine_appointments_insert_v2
ON public.telemedicine_appointments
FOR INSERT TO authenticated
WITH CHECK (
  (
    user_id = (SELECT auth.uid())
    AND patient_id = (SELECT auth.uid())
    AND COALESCE(status, 'requested') = 'requested'
    AND professional_id IS NULL
    AND professional_notes IS NULL
    AND prescription_text IS NULL
    AND orientation_text IS NULL
    AND room_url IS NULL
    AND meet_url IS NULL
    AND paid_at IS NULL
  )
  OR private.telemedicine_professional_owns((SELECT auth.uid()), professional_id)
  OR private.concierge_operations_is_staff((SELECT auth.uid()))
);

CREATE POLICY telemedicine_appointments_update_v2
ON public.telemedicine_appointments
FOR UPDATE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR patient_id = (SELECT auth.uid())
  OR private.telemedicine_professional_owns((SELECT auth.uid()), professional_id)
  OR private.concierge_operations_is_staff((SELECT auth.uid()))
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  OR patient_id = (SELECT auth.uid())
  OR private.telemedicine_professional_owns((SELECT auth.uid()), professional_id)
  OR private.concierge_operations_is_staff((SELECT auth.uid()))
);

CREATE POLICY telemedicine_appointments_delete_v2
ON public.telemedicine_appointments
FOR DELETE TO authenticated
USING (
  private.telemedicine_professional_owns((SELECT auth.uid()), professional_id)
  OR private.concierge_operations_is_staff((SELECT auth.uid()))
);

-- Patient UPDATE integrity guard: own-row RLS does not by itself protect columns.
CREATE OR REPLACE FUNCTION private.telemedicine_guard_patient_update_impl()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller UUID := auth.uid();
  caller_is_patient BOOLEAN;
  caller_is_professional BOOLEAN;
  caller_is_staff BOOLEAN;
  allowed_cols TEXT[] := ARRAY[
    'status',
    'patient_confirmed',
    'patient_confirmed_at',
    'data_sharing_authorized',
    'data_sharing_authorized_at',
    'shared_data_permissions',
    'cancelled_at',
    'cancellation_reason',
    'updated_at'
  ];
BEGIN
  IF caller IS NULL THEN
    RETURN NEW;
  END IF;

  caller_is_patient := (
    caller = OLD.user_id
    OR caller = OLD.patient_id
  );

  caller_is_professional :=
    private.telemedicine_professional_owns(caller, OLD.professional_id);

  caller_is_staff :=
    private.concierge_operations_is_staff(caller);

  IF caller_is_patient
     AND NOT caller_is_professional
     AND NOT caller_is_staff THEN

    IF (to_jsonb(NEW) - allowed_cols)
       IS DISTINCT FROM
       (to_jsonb(OLD) - allowed_cols) THEN
      RAISE EXCEPTION
        'Patient update attempted to modify protected telemedicine fields';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (
          OLD.status IN ('scheduled','reminder_sent','confirmed')
          AND NEW.status = 'confirmed'
        )
        OR NEW.status = 'cancelled'
      ) THEN
        RAISE EXCEPTION
          'Patient status transition is not allowed: % -> %',
          OLD.status,
          NEW.status;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.telemedicine_guard_patient_update_impl() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_telemedicine_guard_patient_update
ON public.telemedicine_appointments;

CREATE TRIGGER trg_telemedicine_guard_patient_update
BEFORE UPDATE ON public.telemedicine_appointments
FOR EACH ROW
EXECUTE FUNCTION private.telemedicine_guard_patient_update_impl();

-- Events: access follows the parent appointment.
CREATE POLICY telemedicine_events_select_v2
ON public.telemedicine_events
FOR SELECT TO authenticated
USING (
  private.telemedicine_can_access_appointment(
    appointment_id,
    (SELECT auth.uid())
  )
);

CREATE POLICY telemedicine_events_insert_v2
ON public.telemedicine_events
FOR INSERT TO authenticated
WITH CHECK (
  actor_user_id = (SELECT auth.uid())
  AND private.telemedicine_can_access_appointment(
    appointment_id,
    (SELECT auth.uid())
  )
);

-- Normalize event ownership and prevent audit spoofing.
CREATE OR REPLACE FUNCTION private.telemedicine_normalize_event_impl()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller UUID := auth.uid();
  appointment_patient UUID;
  appointment_professional UUID;
  caller_is_patient BOOLEAN;
  caller_is_professional BOOLEAN;
  caller_is_staff BOOLEAN;
BEGIN
  SELECT COALESCE(a.patient_id, a.user_id), a.professional_id
  INTO appointment_patient, appointment_professional
  FROM public.telemedicine_appointments a
  WHERE a.id = NEW.appointment_id;

  IF appointment_patient IS NULL THEN
    RAISE EXCEPTION 'Appointment not found for telemedicine event';
  END IF;

  NEW.patient_id := appointment_patient;
  NEW.professional_id := appointment_professional;

  IF caller IS NOT NULL THEN
    IF NOT private.telemedicine_can_access_appointment(NEW.appointment_id, caller) THEN
      RAISE EXCEPTION 'No access to telemedicine appointment';
    END IF;

    NEW.actor_user_id := caller;

    caller_is_patient := caller = appointment_patient;
    caller_is_professional :=
      private.telemedicine_professional_owns(caller, appointment_professional);
    caller_is_staff :=
      private.concierge_operations_is_staff(caller);

    IF caller_is_patient
       AND NOT caller_is_professional
       AND NOT caller_is_staff
       AND NEW.type NOT IN (
         'patient_requested',
         'patient_confirmed',
         'patient_authorized_sharing',
         'patient_cancelled'
       ) THEN
      RAISE EXCEPTION 'Patient event type is not allowed: %', NEW.type;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.telemedicine_normalize_event_impl() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_telemedicine_normalize_event
ON public.telemedicine_events;

CREATE TRIGGER trg_telemedicine_normalize_event
BEFORE INSERT ON public.telemedicine_events
FOR EACH ROW
EXECUTE FUNCTION private.telemedicine_normalize_event_impl();

-- Explicit grants. No anonymous table access.
REVOKE ALL ON public.telemedicine_appointments FROM anon, PUBLIC;
REVOKE ALL ON public.telemedicine_events FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.telemedicine_appointments
TO authenticated;

GRANT SELECT, INSERT
ON public.telemedicine_events
TO authenticated;

GRANT ALL
ON public.telemedicine_appointments
TO service_role;

GRANT ALL
ON public.telemedicine_events
TO service_role;

-- Verification before commit.
DO $$
DECLARE
  insecure_count INTEGER;
BEGIN
  SELECT count(*)
  INTO insecure_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('telemedicine_appointments','telemedicine_events')
    AND (
      COALESCE(qual, '') = 'true'
      OR COALESCE(with_check, '') = 'true'
    );

  IF insecure_count > 0 THEN
    RAISE EXCEPTION
      'Telemedicine hardening failed: % unrestricted policies remain',
      insecure_count;
  END IF;

  IF has_table_privilege('anon','public.telemedicine_appointments','SELECT')
     OR has_table_privilege('anon','public.telemedicine_events','SELECT') THEN
    RAISE EXCEPTION 'Telemedicine hardening failed: anon table access remains';
  END IF;
END $$;

COMMIT;

SELECT
  'PASS' AS telemedicine_rls_hardening_v2,
  (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'telemedicine_appointments'
  ) AS appointment_policies,
  (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'telemedicine_events'
  ) AS event_policies,
  NOW() AS checked_at;
