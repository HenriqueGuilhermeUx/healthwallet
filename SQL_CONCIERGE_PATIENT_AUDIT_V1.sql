-- HEALTH CONCIERGE - PATIENT ACCESS AUDIT V1
-- Validation environment only. Run after request-context migration.

CREATE OR REPLACE FUNCTION public.concierge_list_my_context_accesses()
RETURNS TABLE (
  access_id UUID,
  request_id UUID,
  professional_name TEXT,
  professional_role TEXT,
  purpose TEXT,
  consent_version TEXT,
  accessed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id AS access_id,
    l.request_id,
    COALESCE(s.display_name, 'Profissional da equipe') AS professional_name,
    COALESCE(s.role, 'professional') AS professional_role,
    l.purpose,
    l.consent_version,
    l.created_at AS accessed_at
  FROM public.concierge_context_access_logs l
  LEFT JOIN public.concierge_staff s ON s.user_id = l.actor_user_id
  WHERE l.patient_id = auth.uid()
  ORDER BY l.created_at DESC
  LIMIT 30;
$$;

REVOKE ALL ON FUNCTION public.concierge_list_my_context_accesses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_list_my_context_accesses() TO authenticated;
