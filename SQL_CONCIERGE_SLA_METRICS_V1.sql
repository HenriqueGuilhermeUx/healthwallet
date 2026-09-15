-- =====================================================
-- HEALTH CONCIERGE - SLA METRICS V1
-- Validation environment only.
-- Run after the Concierge access/consent guards.
-- Makes first-response analytics deterministic.
-- =====================================================

-- A staff status transition away from NEW is a first human response.
CREATE OR REPLACE FUNCTION public.concierge_capture_first_response_on_request_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.first_response_at IS NULL
     AND NEW.first_response_at IS NULL
     AND OLD.status = 'new'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status <> 'new'
     AND public.concierge_is_staff() THEN
    NEW.first_response_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concierge_first_response_request_update ON public.concierge_requests;
CREATE TRIGGER trg_concierge_first_response_request_update
BEFORE UPDATE ON public.concierge_requests
FOR EACH ROW EXECUTE FUNCTION public.concierge_capture_first_response_on_request_update();

-- A staff message/note may be the first response even if status is intentionally unchanged.
CREATE OR REPLACE FUNCTION public.concierge_capture_first_response_on_staff_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.actor_role IN ('nurse','doctor','care_coordinator','admin') THEN
    UPDATE public.concierge_requests
    SET first_response_at = COALESCE(first_response_at, NEW.created_at),
        updated_at = CASE WHEN first_response_at IS NULL THEN NOW() ELSE updated_at END
    WHERE id = NEW.request_id
      AND first_response_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concierge_first_response_staff_event ON public.concierge_request_events;
CREATE TRIGGER trg_concierge_first_response_staff_event
AFTER INSERT ON public.concierge_request_events
FOR EACH ROW EXECUTE FUNCTION public.concierge_capture_first_response_on_staff_event();

-- Backfill is deliberately NOT automatic. Historical records without a reliable
-- first staff interaction should remain null rather than inventing an SLA timestamp.
