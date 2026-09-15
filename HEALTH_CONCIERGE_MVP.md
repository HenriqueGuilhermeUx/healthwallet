# HealthWallet Concierge — MVP Product + Operating Architecture

## 1. North Star

HealthWallet Concierge is not a consultation package and not a replacement for a health plan.

Its product promise is:

> Make the patient feel that there is a team continuously following their health, helping them understand what changed, what matters now and what to do next.

The Concierge is the continuous coordination layer of the existing ecosystem:

```text
HealthWallet
  personal health data, exams, medications, family, wearables, MedScore
        ↓
HealthWallet Concierge
  coordination, prioritization, follow-up, navigation, action plans
        ↓
AI → Nurse care manager → Reference physician → Specialist / exam partner
        ↓
MyDataMed
  professional workspace, clinical operations, appointments and records
```

## 2. Product boundaries

### HealthWallet

Remains useful and free on its own.

Core role:
- personal health repository
- exams and documents
- medications and prescriptions
- timeline and medical passport
- family profiles
- MedScore
- smartwatch / Health Connect data
- patient-controlled sharing
- basic health intelligence

The free HealthWallet is acquisition, habit and long-term patient relationship. It is not a crippled trial of Concierge.

### MyDataMed

Remains a standalone B2B product for professionals and clinics.

Core role:
- professional workspace
- appointments
- teleconsultation
- clinical records
- patient CRM
- authorized access to HealthWallet data
- professional communication
- future billing / payments

### HealthWallet Concierge

Paid Health-as-a-Service layer for individuals and families.

Core role:
- care coordination
- nurse-led longitudinal follow-up
- health navigation
- action plans
- proactive pending-item follow-up
- second analysis workflow
- symptom / question intake
- escalation to physician
- programs for common longitudinal needs
- family health coordination

Important: Concierge is a commercial/service layer inside the same ecosystem. It should not require a separate patient account or a separate patient app.

## 3. Core customer promise

The patient should be able to answer five questions immediately:

1. How is my health now?
2. What changed recently?
3. What do I need to do next?
4. Who is following me?
5. Where do I go when I need help?

This becomes the design principle for every patient-facing screen.

## 4. Initial personas to validate separately

### Persona A — Has a health plan

Pain:
- has access but poor continuity
- different doctors and fragmented care
- exams and recommendations scattered
- does not know what to prioritize

Positioning:

> We do not replace your health plan. We help you use it better and keep your health journey coordinated between appointments.

### Persona B — No health plan

Pain:
- private care is expensive
- uncertain when and where to seek help
- episodic use of urgent care
- little preventive follow-up

Positioning:

> You do not have to manage your health alone. You have a team helping you understand what to do next and where to go when needed.

### Persona C — Family health manager

Usually manages health tasks for children, spouse and/or elderly parents.

Pain:
- vaccinations, exams, appointments and medications spread across people and places
- mental load of remembering everything

Positioning:

> One place to coordinate the health of the people you care for.

## 5. MVP service model

The MVP should validate coordination, not maximize the amount of clinical service included.

### Patient receives

- full free HealthWallet capabilities
- MedScore and longitudinal health summary
- wearable / Health Connect integration
- Concierge dashboard
- reference care team
- asynchronous help requests
- nurse triage / care coordination
- health navigation
- action plan and pending items
- exam submission and review workflow
- second-analysis workflow
- physician escalation when clinically appropriate
- family coordination where consent / legal representation allows it

### Explicitly not included in MVP

- unlimited physician appointments
- specialist coverage
- hospital / procedure coverage
- guaranteed emergency response
- medical transport
- insurance-like reimbursement
- unlimited laboratory or imaging exams
- automatic diagnosis from AI or wearable data

This boundary protects economics and avoids positioning the service as a disguised health plan.

## 6. Clinical / operational ladder

```text
Patient event or request
        ↓
System context + AI organization
        ↓
Nurse care manager
        ↓ when needed
Reference physician
        ↓ when needed
Specialist / external service / exam partner
```

The AI organizes, summarizes, prioritizes and supports workflows. It must not be the final clinical authority for diagnosis or treatment.

The nurse is the continuity owner.

The physician is the escalation and medical decision layer.

Specialists are initially marketplace / partner capacity rather than fixed payroll capacity.

## 7. Patient MVP information architecture

### 7.1 Concierge home

The most important screen.

Show:
- greeting
- current MedScore / health status
- meaningful recent changes
- pending actions
- reference team
- next scheduled interaction
- three primary actions:
  - Request help
  - Send exam
  - Talk to my team

The screen must answer: "What matters now?"

### 7.2 My Health

Reuse existing HealthWallet data rather than duplicate it.

Show:
- MedScore
- score history
- key domains
- relevant trends
- exams
- vitals / device context
- medications
- timeline

### 7.3 My Team

Show the assigned care relationship, not a generic provider directory.

MVP roles:
- nurse care manager
- reference physician

Future:
- nutritionist
- psychologist
- specialists
- partner services

### 7.4 Request Help

Request types:
- symptom
- health question / orientation
- understand an exam
- second analysis
- medication review request
- health navigation
- other

Each request becomes a trackable work item with:
- owner
- priority
- status
- timestamps
- patient context
- escalation history
- outcome

### 7.5 Action Plan

The recurring value engine.

Actions can represent:
- exam
- vaccine
- follow-up
- medication-related action
- lifestyle goal
- measurement request
- document upload
- appointment
- preventive action

Every action has:
- title
- reason
- due date
- status
- responsible party
- source (nurse, physician, program, system)
- completion evidence when applicable

### 7.6 Programs

Not required to launch every program on day one.

First candidates:
- hypertension
- metabolic / weight management
- diabetes risk / diabetes follow-up
- healthy aging
- women's health

Each program is a template generating:
- goals
- educational content
- actions
- checkpoints
- recommended measurements
- team touchpoints

### 7.7 Family

Reuse existing HealthWallet family architecture.

Concierge adds, per family member where authorization allows:
- care team
- health status summary
- pending actions
- vaccinations
- exams
- medications
- relevant alerts

No cross-profile access without explicit legal/consent rules.

### 7.8 Health navigation

The user can ask practical questions such as:
- Which type of professional should I look for?
- What documents do I need for this exam?
- What should I bring to the next appointment?
- What follow-up was recommended after this result?

The purpose is coordination, not insurance authorization guarantees.

### 7.9 Quick orientation

Do not position as emergency care or 24/7 emergency response.

Working labels:
- Quick Orientation
- Priority Guidance

Always include clear emergency red-flag guidance to seek local emergency services when appropriate.

## 8. Nurse workspace — the operational heart

The nurse dashboard should be a portfolio management screen, not a list of medical records.

Top-level view:

```text
Portfolio: 284 patients

7 require attention now
19 have overdue actions
31 need follow-up
227 have no action required
```

Work queues:
- new requests
- new exams
- system / MedScore alerts
- overdue actions
- planned follow-ups
- physician escalations awaiting response
- appointments today

Patient cockpit:
- concise clinical / health summary
- what changed
- evidence / source
- current MedScore and confidence
- device trends when relevant
- latest exams
- active medications
- current action plan
- last team interaction
- open requests
- next recommended action

The system should progressively move toward "show me who needs attention" instead of "make me inspect every patient".

## 9. Physician workspace

Keep physician operations focused and low-friction.

Queues:
- nurse escalations
- second analyses
- scheduled teleconsultations
- pending opinions / reviews

Case view should arrive pre-organized with patient-authorized context:
- question / reason for escalation
- nurse summary
- relevant HealthWallet history
- relevant exams
- medications
- MedScore context
- relevant wearable trend, when useful
- previous actions / interactions

The physician should not need to reconstruct the case manually from dozens of raw records.

## 10. Longitudinal intelligence model

The system loop is:

```text
DATA
 ↓
CONTEXT
 ↓
PRIORITY
 ↓
ACTION
 ↓
FOLLOW-UP
 ↓
OUTCOME
 ↓
NEW DATA
```

### Existing assets to reuse

- HealthWallet profile and clinical data
- medical records / exams
- medications
- timeline
- family
- professional care links
- telemedicine appointments
- Health Connect / wearable summaries
- MedScore / health_scores

Concierge should reference these sources rather than create parallel copies.

### New Concierge domain objects

Recommended minimum:

1. `concierge_enrollments`
   - who is enrolled
   - plan / cohort
   - activation / pause / cancellation

2. `concierge_assignments`
   - patient ↔ nurse / physician assignment
   - role
   - active dates

3. `concierge_requests`
   - patient requests / intake
   - category
   - urgency / priority
   - status
   - assigned professional
   - escalation state

4. `concierge_request_events`
   - auditable lifecycle of each request

5. `concierge_actions`
   - action-plan items
   - due date
   - status
   - source
   - responsible actor

6. `concierge_program_enrollments`
   - program membership and state

7. `concierge_alerts`
   - structured alerts generated from rules, MedScore, overdue tasks or changes in longitudinal data
   - alert is a workflow signal, not a diagnosis

Do not create a second exam table, second medication table, second wearable table or second health score table.

## 11. Alert philosophy

An alert is not automatically a clinical diagnosis.

Good examples:
- action overdue
- new exam uploaded
- significant activity decrease compared with user's baseline
- recent elevated measurements present in authorized data
- medication refill / stock workflow
- MedScore changed materially
- follow-up date reached

Each alert needs:
- source
- reason
- evidence summary
- severity / priority
- whether human review is required
- status
- resolved_by
- resolved_at

## 12. Commercial MVP

Do not start by promising a high number of physician consultations.

Working experiments, not final pricing:

### Individual pilot
- low introductory monthly price
- coordination + nurse + physician escalation
- physician consultation benefit deliberately limited / controlled

### Family pilot
- up to defined number of family members
- shared family health management experience
- each person's data remains permission-scoped

The pilot objective is to learn service utilization and economics, not maximize margin immediately.

## 13. Unit economics metrics that must be instrumented from day one

For every 100 enrolled lives measure:

- requests per member per month
- % resolved without human action
- % handled by nurse only
- % escalated to physician
- physician minutes per enrolled member per month
- nurse minutes per enrolled member per month
- median first-response time
- median request resolution time
- action-plan completion rate
- % members with at least one meaningful monthly touchpoint
- 30/60/90-day retention
- cancellation reason
- cost per enrolled life
- cost per active user
- cost per resolved request
- NPS / trust measure
- utilization split: with health plan vs without health plan

Never build the financial model assuming all subscribers use the same amount of care.

## 14. 90-day validation design

Suggested pilot cohort:
- 100 patients / families initially
- small nurse team
- small physician pool
- restricted geography only if operationally useful, not technically required

Test two segments separately:
- people with health plans
- people without health plans

Questions to answer:
1. Why did they subscribe?
2. What do they use most?
3. Does a reference nurse create perceived value?
4. What share of requests truly need a physician?
5. How many lives can one nurse safely coordinate with software support?
6. Does wearable / MedScore context create actionable work or only interesting data?
7. Does family management improve acquisition / retention?
8. What price feels natural after the pilot?

## 15. Safety and regulatory product guardrails

Before production Concierge operations:

- define professional scopes and escalation protocols
- define red-flag / emergency routing
- ensure medical acts remain with authorized professionals
- ensure patient consent and professional access are explicit and auditable
- tighten RLS for professional access; MVP-wide authenticated access policies are not acceptable for production clinical data
- define retention, revocation and account deletion behavior
- define response-time promises carefully; do not imply emergency coverage unless operations truly support it
- do not describe wearable / MedScore alerts as diagnoses
- do not advertise the service as covering procedures, hospitalization or unlimited care

## 16. MVP build order

### Sprint 0 — Foundation
- canonical Concierge data model
- RLS / roles
- audit trail
- assignment model
- feature flag / enrollment

### Sprint 1 — Patient Concierge Home
- `/concierge`
- current score / trend
- pending actions
- assigned team
- primary actions: request help, send exam, talk to team

### Sprint 2 — Request Help + Work Queue
- intake flow
- request creation
- request status
- nurse queue
- nurse assignment / triage
- escalation to physician

### Sprint 3 — Action Plans
- create action
- due dates
- complete / overdue
- patient and nurse views

### Sprint 4 — Team + Messaging
- nurse / physician cards
- contextual messaging around requests and actions
- reuse existing chat infrastructure where possible

### Sprint 5 — Longitudinal Alerts
- overdue actions
- new exam events
- material MedScore changes
- selected wearable trend signals
- nurse attention queue

### Sprint 6 — Pilot Analytics
- utilization
- service times
- escalation rate
- cohort / plan segment
- cost-driving events

## 17. Existing code already aligned with this direction

The current HealthWallet already contains major building blocks that should be reused:
- Dashboard
- MedScore
- Device Data / HealthWallet Connect
- Family
- Care Links
- Chat
- Exams / Exam Inbox
- Telemedicine
- Marketplace
- Emergency / quick-help foundations

Therefore this is not a greenfield app. The correct implementation strategy is to add a coordination domain and reorganize existing capabilities around the Concierge experience.

## 18. Working product name

Use **HealthWallet Concierge** as the working product name during MVP development.

Rationale:
- keeps trust and distribution under HealthWallet
- makes the relationship to the patient app obvious
- avoids a fourth standalone product / login
- can later be branded independently if market testing proves a stronger name

External positioning line:

> Your health, continuously coordinated.

Portuguese working line:

> Sua saúde acompanhada, organizada e coordenada ao longo do tempo.

## 19. Definition of MVP success

The MVP succeeds if users do not describe it primarily as "telemedicine".

The desired user perception is:

> "I have somewhere to go, someone is following me, and I know what I need to do next."

That is the product.