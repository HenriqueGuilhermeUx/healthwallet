-- =====================================================
-- HEALTH CONCIERGE - AUTOMATION + ACCESS GUARDS V1
-- Run AFTER:
--   1) SQL_CONCIERGE_MVP_V1.sql
--   2) SQL_CONCIERGE_PILOT_ANALYTICS_V1.sql
-- Validation environment first. No CI applies this migration.
-- =====================================================

-- -----------------------------------------------------
-- 1) Role helpers
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.concierge_has_staff_role(required_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.concierge_staff s
    WHERE s.user_id = auth.uid()
      AND s.active = true
      AND s.role = ANY(required_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.concierge_has_staff_role(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_has_staff_role(TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.concierge_can_access_patient(target_patient UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[])
    OR EXISTS (
      SELECT 1
      FROM public.concierge_assignments a
      WHERE a.patient_id = target_patient
        AND a.professional_id = auth.uid()
        AND a.status = 'active'
    );
$$;

REVOKE ALL ON FUNCTION public.concierge_can_access_patient(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_can_access_patient(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.concierge_can_access_request(target_request UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.concierge_requests r
    LEFT JOIN public.concierge_staff s ON s.user_id = auth.uid() AND s.active = true
    WHERE r.id = target_request
      AND (
        s.role IN ('admin','care_coordinator')
        OR r.assigned_nurse_id = auth.uid()
        OR r.assigned_doctor_id = auth.uid()
        OR (
          s.role = 'nurse'
          AND r.assigned_nurse_id IS NULL
          AND r.assigned_doctor_id IS NULL
          AND r.status IN ('new','waiting_nurse')
        )
        OR (
          s.role = 'doctor'
          AND r.assigned_doctor_id IS NULL
          AND r.status IN ('escalated_medical','medical_review')
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.concierge_can_access_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_can_access_request(UUID) TO authenticated;

-- -----------------------------------------------------
-- 2) Automatic routing to the longitudinal care team
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.concierge_route_new_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_nurse_id IS NULL THEN
    SELECT a.professional_id
    INTO NEW.assigned_nurse_id
    FROM public.concierge_assignments a
    WHERE a.patient_id = NEW.patient_id
      AND a.status = 'active'
      AND a.role IN ('nurse','care_coordinator')
    ORDER BY
      CASE WHEN a.role = 'nurse' THEN 0 ELSE 1 END,
      CASE WHEN a.is_primary THEN 0 ELSE 1 END,
      a.started_at ASC
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concierge_route_new_request ON public.concierge_requests;
CREATE TRIGGER trg_concierge_route_new_request
BEFORE INSERT ON public.concierge_requests
FOR EACH ROW EXECUTE FUNCTION public.concierge_route_new_request();

CREATE OR REPLACE FUNCTION public.concierge_route_medical_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('escalated_medical','medical_review')
     AND NEW.assigned_doctor_id IS NULL THEN
    SELECT a.professional_id
    INTO NEW.assigned_doctor_id
    FROM public.concierge_assignments a
    WHERE a.patient_id = NEW.patient_id
      AND a.status = 'active'
      AND a.role = 'doctor'
    ORDER BY
      CASE WHEN a.is_primary THEN 0 ELSE 1 END,
      a.started_at ASC
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concierge_route_medical_escalation ON public.concierge_requests;
CREATE TRIGGER trg_concierge_route_medical_escalation
BEFORE UPDATE OF status ON public.concierge_requests
FOR EACH ROW EXECUTE FUNCTION public.concierge_route_medical_escalation();

-- -----------------------------------------------------
-- 3) Tighten request/event access by operational role
-- -----------------------------------------------------
DROP POLICY IF EXISTS concierge_requests_patient_read ON public.concierge_requests;
CREATE POLICY concierge_requests_patient_read ON public.concierge_requests
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid());

DROP POLICY IF EXISTS concierge_requests_staff_read ON public.concierge_requests;
CREATE POLICY concierge_requests_staff_read ON public.concierge_requests
  FOR SELECT TO authenticated
  USING (public.concierge_can_access_request(id));

DROP POLICY IF EXISTS concierge_requests_staff_update ON public.concierge_requests;
CREATE POLICY concierge_requests_staff_update ON public.concierge_requests
  FOR UPDATE TO authenticated
  USING (public.concierge_can_access_request(id))
  WITH CHECK (
    public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[])
    OR assigned_nurse_id = auth.uid()
    OR assigned_doctor_id = auth.uid()
    OR public.concierge_can_access_request(id)
  );

DROP POLICY IF EXISTS concierge_events_read ON public.concierge_request_events;
CREATE POLICY concierge_events_patient_read ON public.concierge_request_events
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid() AND visibility = 'patient');

DROP POLICY IF EXISTS concierge_events_staff_read ON public.concierge_request_events;
CREATE POLICY concierge_events_staff_read ON public.concierge_request_events
  FOR SELECT TO authenticated
  USING (public.concierge_can_access_request(request_id));

DROP POLICY IF EXISTS concierge_events_staff_insert ON public.concierge_request_events;
CREATE POLICY concierge_events_staff_insert ON public.concierge_request_events
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND public.concierge_can_access_request(request_id)
  );

-- -----------------------------------------------------
-- 4) Tighten membership/team administration
-- -----------------------------------------------------
DROP POLICY IF EXISTS concierge_memberships_patient_read ON public.concierge_memberships;
CREATE POLICY concierge_memberships_patient_read ON public.concierge_memberships
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid());

DROP POLICY IF EXISTS concierge_memberships_staff_read ON public.concierge_memberships;
CREATE POLICY concierge_memberships_staff_read ON public.concierge_memberships
  FOR SELECT TO authenticated
  USING (
    public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[])
    OR public.concierge_can_access_patient(patient_id)
  );

DROP POLICY IF EXISTS concierge_memberships_staff_manage ON public.concierge_memberships;
CREATE POLICY concierge_memberships_staff_manage ON public.concierge_memberships
  FOR ALL TO authenticated
  USING (public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[]))
  WITH CHECK (public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[]));

DROP POLICY IF EXISTS concierge_assignments_read ON public.concierge_assignments;
CREATE POLICY concierge_assignments_read ON public.concierge_assignments
  FOR SELECT TO authenticated
  USING (
    patient_id = auth.uid()
    OR professional_id = auth.uid()
    OR public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[])
  );

DROP POLICY IF EXISTS concierge_assignments_staff_manage ON public.concierge_assignments;
CREATE POLICY concierge_assignments_staff_manage ON public.concierge_assignments
  FOR ALL TO authenticated
  USING (public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[]))
  WITH CHECK (public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[]));

-- -----------------------------------------------------
-- 5) Staff access to patient actions/alerts only when relevant
-- -----------------------------------------------------
DROP POLICY IF EXISTS concierge_actions_read ON public.concierge_actions;
CREATE POLICY concierge_actions_patient_read ON public.concierge_actions
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid());

DROP POLICY IF EXISTS concierge_actions_staff_read ON public.concierge_actions;
CREATE POLICY concierge_actions_staff_read ON public.concierge_actions
  FOR SELECT TO authenticated
  USING (public.concierge_can_access_patient(patient_id));

DROP POLICY IF EXISTS concierge_actions_staff_manage ON public.concierge_actions;
CREATE POLICY concierge_actions_staff_manage ON public.concierge_actions
  FOR ALL TO authenticated
  USING (public.concierge_can_access_patient(patient_id))
  WITH CHECK (public.concierge_can_access_patient(patient_id));

DROP POLICY IF EXISTS concierge_alerts_read ON public.concierge_alerts;
CREATE POLICY concierge_alerts_patient_read ON public.concierge_alerts
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid());

DROP POLICY IF EXISTS concierge_alerts_staff_read ON public.concierge_alerts;
CREATE POLICY concierge_alerts_staff_read ON public.concierge_alerts
  FOR SELECT TO authenticated
  USING (public.concierge_can_access_patient(patient_id));

DROP POLICY IF EXISTS concierge_alerts_staff_manage ON public.concierge_alerts;
CREATE POLICY concierge_alerts_staff_manage ON public.concierge_alerts
  FOR ALL TO authenticated
  USING (public.concierge_can_access_patient(patient_id))
  WITH CHECK (public.concierge_can_access_patient(patient_id));

-- -----------------------------------------------------
-- 6) Patient action-integrity guard
-- Patient may complete/reopen an assigned action, but cannot
-- rewrite clinical/operational content created by the team.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.concierge_guard_patient_action_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.patient_id AND NOT public.concierge_is_staff() THEN
    IF NEW.patient_id IS DISTINCT FROM OLD.patient_id
       OR NEW.request_id IS DISTINCT FROM OLD.request_id
       OR NEW.program_enrollment_id IS DISTINCT FROM OLD.program_enrollment_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.assigned_professional_id IS DISTINCT FROM OLD.assigned_professional_id
       OR NEW.category IS DISTINCT FROM OLD.category
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.metadata IS DISTINCT FROM OLD.metadata
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Patient may only update action completion state';
    END IF;

    IF NEW.status NOT IN ('pending','in_progress','completed') THEN
      RAISE EXCEPTION 'Invalid patient action status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concierge_guard_patient_action_update ON public.concierge_actions;
CREATE TRIGGER trg_concierge_guard_patient_action_update
BEFORE UPDATE ON public.concierge_actions
FOR EACH ROW EXECUTE FUNCTION public.concierge_guard_patient_action_update();

-- -----------------------------------------------------
-- 7) Escalation trail: make routing visible in timeline
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.concierge_log_assignment_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_nurse_id IS DISTINCT FROM OLD.assigned_nurse_id
     AND NEW.assigned_nurse_id IS NOT NULL THEN
    INSERT INTO public.concierge_request_events (
      request_id, patient_id, actor_role, event_type, visibility, message, payload
    ) VALUES (
      NEW.id,
      NEW.patient_id,
      'system',
      'nurse_assigned',
      'staff_only',
      'Caso direcionado para enfermagem/coordenação.',
      jsonb_build_object('assigned_nurse_id', NEW.assigned_nurse_id)
    );
  END IF;

  IF NEW.assigned_doctor_id IS DISTINCT FROM OLD.assigned_doctor_id
     AND NEW.assigned_doctor_id IS NOT NULL THEN
    INSERT INTO public.concierge_request_events (
      request_id, patient_id, actor_role, event_type, visibility, message, payload
    ) VALUES (
      NEW.id,
      NEW.patient_id,
      'system',
      'doctor_assigned',
      'patient',
      'Sua solicitação foi encaminhada para revisão médica.',
      jsonb_build_object('assigned_doctor_id', NEW.assigned_doctor_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concierge_log_assignment_changes ON public.concierge_requests;
CREATE TRIGGER trg_concierge_log_assignment_changes
AFTER UPDATE ON public.concierge_requests
FOR EACH ROW EXECUTE FUNCTION public.concierge_log_assignment_changes();
