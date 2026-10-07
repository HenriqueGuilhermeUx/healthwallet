-- Concierge Digital AI V1 - post-check
-- Read-only verification after SQL_CONCIERGE_DIGITAL_AI_V1.sql.

WITH expected_tables(name) AS (
  VALUES
    ('concierge_chat_sessions'),
    ('concierge_chat_messages')
)
SELECT
  e.name,
  to_regclass('public.' || e.name) IS NOT NULL AS exists,
  COALESCE(c.relrowsecurity, false) AS rls_enabled
FROM expected_tables e
LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || e.name)
ORDER BY e.name;

SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE (n.nspname, p.proname) IN (
  ('private', 'concierge_chat_staff_role'),
  ('private', 'concierge_chat_is_staff'),
  ('public', 'concierge_chat_request_human'),
  ('public', 'concierge_chat_staff_take'),
  ('public', 'concierge_chat_staff_return_to_ai')
)
ORDER BY n.nspname, p.proname;

SELECT
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('concierge_chat_sessions', 'concierge_chat_messages')
ORDER BY tablename, policyname;

SELECT
  p.pubname,
  c.relname AS table_name
FROM pg_publication p
JOIN pg_publication_rel pr ON pr.prpubid = p.oid
JOIN pg_class c ON c.oid = pr.prrelid
WHERE p.pubname = 'supabase_realtime'
  AND c.relname IN ('concierge_chat_sessions', 'concierge_chat_messages')
ORDER BY c.relname;

SELECT
  'PASS' AS result,
  'Concierge Digital schema installed; verify both tables have RLS=true, five functions are present, policies exist and both chat tables are in supabase_realtime.' AS note;


SELECT
  grantee,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('concierge_chat_sessions', 'concierge_chat_messages')
  AND grantee IN ('authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;
