# Alternative Ventures USA — Health Wallet / MyDataMed architecture (research-only)

Date: 2026-10-24. Status: **design / NO US DEPLOYMENT / NO DATABASE CHANGES**.
US isolation branch: `feature/usa-healthwallet-mydatamed-architecture-20261024`.
Rule: never change Brazilian production domains, records, users, apps, Supabase projects, payment systems or integrations.

## Evidence observed from the existing repository

- The Brazilian Health Wallet is a React/Vite/Capacitor + Supabase application. The inspected pages include `HealthWallet`, `Timeline`, `Consent`, `Exams`, `Medications`, `DeviceData`, `ConciergeHealth`, `Telemedicine`, family and concierge flows.
- `src/pages/Timeline.tsx` uses `medical_events`, `medications`, `health_reminders`.
- `src/pages/ConciergeHealth.tsx` has longitudinal summaries via `health_scores`, device data, exams, medicines and events.
- `src/services/conciergeConsent.ts` defines category-scoped consent, revoke, consent events, and context access logs for Brazilian concierge workflows. Reuse the *concept*, not its production identifiers or permissions.
- `src/pages/Consent.tsx` includes LGPD-oriented terms and caches `accepted_terms` / `localStorage` acceptance. **That is not sufficient evidence of a U.S. health-data sharing authorization**; country-specific consent must be designed separately.
- The `HenriqueGuilhermeUx/mydatamed` repository main branch had one ZIP file at audit time; the executable product source/location remains unverified. Do not assume its architecture or edit it.

## Regulatory classification before any PHI is ingested

1. Classify each role and transaction: consumer-controlled PHR app, HIPAA covered entity, business associate, subcontractor or a combination. HIPAA does not automatically apply to every consumer health app. Document FTC Act and Health Breach Notification Rule obligations where relevant.
2. If providing services to covered entities/business associates, obtain counsel-reviewed BAAs **before** receiving PHI, and require BAAs or equivalent obligations from subcontractors where applicable.
3. Map applicable federal and *state* laws, including special categories, minors, retention and breach notifications. Do not assume a single national consent covers all uses.
4. No advertising pixels or analytics SDKs on PHI-bearing screens until privacy review. No health data in client error logs, prompt logs, search parameters or third-party LLM calls by default.
5. Do not claim HIPAA/FTC compliance before independent security, product and legal audits.

Official starting points:
- https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/hipaa-online-tracking/index.html
- https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0
- https://healthit.gov/regulations/hti-rules/hti-1-final-rule
- https://fhir.healthit.gov/test-kits/smart-app-launch/

## Architecture: independent U.S. boundary

```text
Health Wallet USA patient UX          MyDataMed USA physician UX
            |                                 |
            +-------- US Consent/Auth Gateway-+
                              |
                US FHIR/Clinical API facade
                   |                   |
          US clinical storage    Provider connectors
          tenant/patient scoped  SMART on FHIR / EHR / lab
                   |
            Audit / provenance
```

- Separate U.S. environments, secrets, database/storage projects, tenant IDs, KMS keys and authorization surfaces from Brazil. No automatic data replication; a later cross-border transfer must be purpose-specific, legal and explicitly authorized.
- Canonical clinical resources: Patient, Practitioner, Organization, Encounter, Observation, Condition, AllergyIntolerance, MedicationRequest/Statement, DiagnosticReport, DocumentReference, CarePlan, Task, Consent, Provenance and AuditEvent as appropriate.
- SMART on FHIR/OAuth flows for provider/patient-authorized access with least-privilege scopes, token expiry/revocation; FHIR US Core profile and USCDI mappings **version pinned per integration**, not one loose “FHIR compatible” claim.
- Consent ledger: patient, provider/tenant, purpose of use, resource categories, policy/version, actor identity, explicit grant timestamp, expiry, revocation timestamp, evidence; access checks at *every* server request. Do not equate terms-of-use acceptance with medical consent.
- Store document provenance, origin organization, update timestamps, corrections, extraction confidence and clinician review. Preserve original source snapshots where lawful. AI summarizes only evidence permitted for this recipient.
- Encrypt at rest/in transit, segregate credentials, log access to sensitive clinical context without logging PHI content, and support deletion/retention/legal holds as applicable.

## MyDataMed USA V1 (deliberately narrow)

- Verified professional identity and tenant membership, with server-enforced role-based and patient-scoped authorization.
- Invite patient / bind verified patient to clinician with explicit consent and immediate revocation; patient controls allowed data scopes.
- Patient list with last contact, outstanding tasks, recent labs/consultations, authorized clinical summary and next follow-up.
- Longitudinal timeline showing source, collection date, author and correction lineage.
- Clinician-authored note / follow-up Task, clearly separated from AI-generated draft. No silent edits to original records.
- No automatic medical diagnosis, autonomous treatments, prescriptions, marketing of health attributes, or unreviewed clinician recommendations in V1.

## Health Wallet USA parity plan

Inventory and preserve Brazilian features *as capabilities*, then map to U.S. workflows: exams, medication, reminders, timeline, consent, sharing, family, device data, medical wallet, preventive scores, concierge, telehealth, eligibility and billing. Do not expose Brazil-only SUS, CNH/CNS or local health-plan assumptions to U.S. patients.
Implement U.S.-specific insurance/member card semantics, unit systems, date formats, emergency routing, provider/provider-NPI references, medication terminology, laboratory coding and accessibility only after mappings are audited.

## Implementation gates, in order

1. Source inventory / feature-parity matrix with screenshots and authenticated flows. Verify MyDataMed executable code location first.
2. Regulatory role matrix: consumer B2C vs provider B2B, HIPAA/FTC, state law, data-handling agreements and third-party subprocessors.
3. Create separate *non-production* US Supabase/project resources with RLS, private storage and strict tenant/patient policy; do not copy Brazil production data.
4. Define FHIR and consent adapter contracts with synthetic fixtures; test consent grant, revocation, expiration, multiple clinics, cross-tenant denial and audit logs.
5. Add sandbox SMART on FHIR interoperability tests (Inferno) and provider-specific contract tests, then security review.
6. Only after passing privacy/legal review, do a clinician-supervised limited pilot and phased Health Wallet feature rollout.

**Current gate:** documentation only. No U.S. endpoint, infrastructure, EHR integration, BAA, migration, release or compliance certification has been created or verified.
