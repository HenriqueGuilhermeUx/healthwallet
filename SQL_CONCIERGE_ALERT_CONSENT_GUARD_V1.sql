-- HEALTH CONCIERGE - ALERT CONSENT GUARD V1
-- Validation environment only. Run after consent and alert-engine migrations.

CREATE OR REPLACE FUNCTION public.concierge_guard_alert_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.concierge_has_active_consent(NEW.patient_id) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concierge_guard_alert_consent ON public.concierge_alerts;
CREATE TRIGGER trg_concierge_guard_alert_consent
BEFORE INSERT ON public.concierge_alerts
FOR EACH ROW EXECUTE FUNCTION public.concierge_guard_alert_consent();

CREATE OR REPLACE FUNCTION public.concierge_close_alerts_on_consent_revocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.consent_status = 'revoked'
     AND OLD.consent_status IS DISTINCT FROM NEW.consent_status THEN
    UPDATE public.concierge_alerts
    SET status = 'dismissed',
        resolved_at = NOW(),
        updated_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb)
          || jsonb_build_object('closed_reason', 'patient_consent_revoked')
    WHERE patient_id = NEW.patient_id
      AND status IN ('open','acknowledged');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concierge_close_alerts_on_consent_revocation ON public.concierge_memberships;
CREATE TRIGGER trg_concierge_close_alerts_on_consent_revocation
AFTER UPDATE OF consent_status ON public.concierge_memberships
FOR EACH ROW EXECUTE FUNCTION public.concierge_close_alerts_on_consent_revocation();
