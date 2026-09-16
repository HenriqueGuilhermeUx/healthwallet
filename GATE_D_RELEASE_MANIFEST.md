# Gate D — Health Concierge production release manifest

Release branch: `release/health-concierge-gate-d`

Concierge source reviewed at: `c281e51dc263c97587e9286aab1cb2fffd753834`

Production target: Supabase `qcxdvygbinqkxuahlrrn` and Netlify site `healthwallet1`.

Gate C: PASS in production.

Gate D read-only production preflight: PASS with zero existing `concierge_%` objects.

## Canonical production schema order

1. `SQL_CONCIERGE_PILOT_COMPAT_V1.sql`
2. `SQL_CONCIERGE_MVP_V1.sql`
3. `SQL_CONCIERGE_PILOT_ANALYTICS_V1.sql`
4. `SQL_CONCIERGE_AUTOMATION_GUARDS_V1.sql`
5. `SQL_CONCIERGE_CONSENT_V1.sql`
6. `SQL_CONCIERGE_ROSTER_GUARDS_V1.sql`
7. `SQL_CONCIERGE_REQUEST_INTEGRITY_V1.sql`
8. `SQL_CONCIERGE_PROGRAM_GUARDS_V1.sql`
9. `SQL_CONCIERGE_ALERT_ENGINE_V1.sql`
10. `SQL_CONCIERGE_ALERT_CONSENT_GUARD_V1.sql`
11. `SQL_CONCIERGE_CLINICAL_REVIEW_V1.sql`
12. `SQL_CONCIERGE_REQUEST_CONTEXT_V1.sql`
13. `SQL_CONCIERGE_PATIENT_AUDIT_V1.sql`
14. `SQL_CONCIERGE_SLA_METRICS_V1.sql`
15. `SQL_CONCIERGE_PATIENT_REPLY_ROUTING_V1.sql`
16. `SQL_CONCIERGE_REFERENCE_TEAM_ROUTING_V1.sql`

Then require PASS from:

- `SQL_CONCIERGE_VALIDATION_PRECHECK_V1.sql`
- `SQL_CONCIERGE_PRODUCTION_POSTCHECK_V1.sql`
- Supabase security advisors

## Release boundary

This release intentionally excludes HealthWallet Connect changes and Concierge AI assist. The initial release remains human-led.

## Current stop condition

Do not apply Gate D production DDL until a restorable database backup or PITR point has been verified. The current Supabase organization plan is Free and the connected tooling does not expose a verified recovery snapshot.

After recovery readiness is confirmed, rerun `SQL_CONCIERGE_PRODUCTION_PREFLIGHT_V1.sql` immediately before migration.
