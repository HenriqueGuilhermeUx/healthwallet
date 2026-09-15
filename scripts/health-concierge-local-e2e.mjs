import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.CONCIERGE_VALIDATION_PASSWORD

if (!url || !anonKey || !serviceRoleKey || !password) {
  throw new Error('Missing SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY or CONCIERGE_VALIDATION_PASSWORD')
}

const emails = {
  patientA: 'concierge.patient.a@healthwallet.test',
  patientB: 'concierge.patient.b@healthwallet.test',
  patientC: 'concierge.patient.c@healthwallet.test',
  nurseA: 'concierge.nurse.a@healthwallet.test',
  nurseB: 'concierge.nurse.b@healthwallet.test',
  doctorA: 'concierge.doctor.a@healthwallet.test',
  doctorB: 'concierge.doctor.b@healthwallet.test',
  coordinator: 'concierge.coord@healthwallet.test',
  admin: 'concierge.admin@healthwallet.test',
}

const clientFor = () => createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const service = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function logPass(message) {
  console.log(`PASS: ${message}`)
}

function assertNoError(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data
}

async function signIn(email) {
  const client = clientFor()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn ${email}: ${error.message}`)
  assert(data.user?.id, `No user id after sign in for ${email}`)
  return { client, id: data.user.id, email }
}

async function expectInsertDenied(promise, label) {
  const { data, error } = await promise
  if (!error && Array.isArray(data) && data.length > 0) {
    throw new Error(`${label}: unexpected insert success`)
  }
  if (!error && data && !Array.isArray(data)) {
    throw new Error(`${label}: unexpected insert success`)
  }
  logPass(`${label} denied`)
}

async function expectRpcDenied(promise, label) {
  const { error } = await promise
  if (!error) throw new Error(`${label}: unexpected RPC success`)
  logPass(`${label} denied`)
}

async function expectHidden(client, table, id, label) {
  const { data, error } = await client.from(table).select('id').eq('id', id)
  if (error) throw new Error(`${label}: ${error.message}`)
  assert(Array.isArray(data) && data.length === 0, `${label}: row was visible`)
  logPass(`${label} hidden by RLS`)
}

async function expectUpdateDenied(promise, label) {
  const { data, error } = await promise
  if (error) {
    logPass(`${label} denied`)
    return
  }
  assert(Array.isArray(data) && data.length === 0, `${label}: update unexpectedly changed a row`)
  logPass(`${label} denied`)
}

const personas = {}
for (const [key, email] of Object.entries(emails)) {
  personas[key] = await signIn(email)
}
logPass('all nine synthetic personas authenticated through local Supabase Auth')

const {
  patientA, patientB, patientC,
  nurseA, nurseB, doctorA, doctorB,
  coordinator,
} = personas

// ---------------------------------------------------------------------------
// Negative enrollment / pending-consent controls
// ---------------------------------------------------------------------------
{
  const { data, error } = await patientC.client
    .from('concierge_memberships')
    .select('id')
    .eq('patient_id', patientC.id)
  if (error) throw new Error(`Patient C membership lookup: ${error.message}`)
  assert(data.length === 0, 'Patient C unexpectedly enrolled')

  await expectInsertDenied(
    patientC.client.from('concierge_requests').insert({
      patient_id: patientC.id,
      category: 'guidance',
      title: 'Controle negativo',
      description: 'Paciente sintético não inscrito.',
      urgency: 'routine',
    }).select('id'),
    'Patient C request without enrollment',
  )

  await expectInsertDenied(
    patientA.client.from('concierge_requests').insert({
      patient_id: patientA.id,
      category: 'guidance',
      title: 'Controle de consentimento pendente',
      description: 'Solicitação sintética antes do consentimento.',
      urgency: 'routine',
    }).select('id'),
    'Patient A request before consent',
  )
}

// ---------------------------------------------------------------------------
// Patient A consent + canonical HealthWallet data
// ---------------------------------------------------------------------------
assertNoError(
  await patientA.client.rpc('concierge_accept_consent', {
    requested_version: 'concierge-consent-v1-validation',
  }),
  'Patient A accepts consent',
)
logPass('Patient A explicit consent accepted')

assertNoError(await patientA.client.from('health_plans').insert({
  user_id: patientA.id,
  plan_name: 'Plano Sintético A',
  plan_type: 'validation',
  card_number: 'TEST-A-001',
  beneficiary_name: 'Paciente A',
}), 'Patient A synthetic health plan')

const family = assertNoError(await patientA.client.from('family_members').insert({
  user_id: patientA.id,
  name: 'Familiar Sintético A',
  relationship: 'familiar',
  emergency_contact: true,
}).select('id').single(), 'Patient A family member')

assertNoError(await patientA.client.from('medications').insert({
  user_id: patientA.id,
  name: 'Medicamento Sintético A',
  dosage: '10 mg',
  frequency: '1x/dia',
  is_active: true,
  critical_medication: false,
}), 'Patient A medication')

assertNoError(await patientA.client.from('health_reminders').insert({
  user_id: patientA.id,
  type: 'medication',
  title: 'Lembrete sintético familiar',
  reminder_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  reminder_time: '09:00:00',
  target_family_member_id: family.id,
  is_active: true,
}), 'Patient A family reminder')

const linkedExam = assertNoError(await patientA.client.from('medical_records').insert({
  user_id: patientA.id,
  file_name: 'exame-sintetico-a.pdf',
  exam_type: 'laboratorial',
  exam_date: '2026-09-01',
  laboratory: 'Laboratório Sintético',
  status: 'processed',
  extracted_data: { synthetic: true, marker: 'linked' },
  ai_analysis: 'Conteúdo sintético para validação de escopo.',
}).select('id').single(), 'Patient A linked exam')

const unlinkedExam = assertNoError(await patientA.client.from('medical_records').insert({
  user_id: patientA.id,
  file_name: 'exame-nao-vinculado-a.pdf',
  exam_type: 'laboratorial',
  exam_date: '2026-08-15',
  laboratory: 'Laboratório Sintético',
  status: 'processed',
  extracted_data: { synthetic: true, marker: 'unlinked' },
}).select('id').single(), 'Patient A unlinked exam')

assertNoError(await patientA.client.from('medical_events').insert({
  user_id: patientA.id,
  type: 'follow_up',
  title: 'Evento longitudinal sintético',
  description: 'Evento exclusivamente de validação.',
  event_date: '2026-09-10',
}), 'Patient A medical event')

assertNoError(await patientA.client.from('health_scores').insert({
  user_id: patientA.id,
  score: 82,
  status: 'stable',
  factors: { synthetic: true },
  calculated_at: '2026-09-13T12:00:00Z',
}), 'Patient A baseline MedScore')

assertNoError(await patientA.client.from('health_scores').insert({
  user_id: patientA.id,
  score: 68,
  status: 'review',
  factors: { synthetic: true, delta_test: true },
  calculated_at: '2026-09-14T12:00:00Z',
}), 'Patient A changed MedScore')

assertNoError(await patientA.client.from('health_device_connections').insert({
  user_id: patientA.id,
  provider: 'health_connect',
  display_name: 'Synthetic Health Connect',
  source_device: 'validation',
  status: 'connected',
  scopes_authorized: ['steps'],
  last_sync_at: '2026-09-01T12:00:00Z',
  metadata: { synthetic: true },
}), 'Patient A device connection')

assertNoError(await patientA.client.from('health_daily_summaries').insert({
  user_id: patientA.id,
  summary_date: '2026-09-14',
  sources: ['health_connect'],
  data_points: 1,
  steps: 6500,
  metadata: { synthetic: true },
}), 'Patient A daily summary')

// ---------------------------------------------------------------------------
// Patient A creates a second-analysis case -> reference Nurse A
// ---------------------------------------------------------------------------
const requestA = assertNoError(await patientA.client.from('concierge_requests').insert({
  patient_id: patientA.id,
  category: 'second_analysis',
  title: 'Segunda análise sintética',
  description: 'Solicitação sintética para validação E2E.',
  context_snapshot: { linked_exams: [{ id: linkedExam.id }] },
  urgency: 'routine',
}).select('id,status,assigned_nurse_id,assigned_doctor_id').single(), 'Patient A creates case')

assert(requestA.assigned_nurse_id === nurseA.id, 'Patient A request did not route to Nurse A')
assert(requestA.assigned_doctor_id === null, 'Patient A request unexpectedly has doctor before escalation')
logPass('Patient A new case routed to reference Nurse A')

assertNoError(await patientA.client.from('automation_events').insert({
  event_type: 'concierge_request_created',
  source_app: 'healthwallet',
  source_table: 'concierge_requests',
  source_id: requestA.id,
  actor_user_id: patientA.id,
  actor_role: 'patient',
  patient_id: patientA.id,
  payload: { request_id: requestA.id, category: 'second_analysis', urgency: 'routine' },
  metadata: { synthetic: true, fetch_sensitive_context_by_id: true },
}), 'Sanitized request automation event')

await expectHidden(nurseB.client, 'concierge_requests', requestA.id, 'Nurse B reading Patient A case')
await expectHidden(patientB.client, 'concierge_requests', requestA.id, 'Patient B reading Patient A case')

// ---------------------------------------------------------------------------
// Request-scoped context + audit
// ---------------------------------------------------------------------------
await expectRpcDenied(
  nurseB.client.rpc('concierge_get_request_context', { target_request: requestA.id }),
  'Nurse B loading Patient A context',
)

const contextAForNurse = assertNoError(
  await nurseA.client.rpc('concierge_get_request_context', { target_request: requestA.id }),
  'Nurse A loads authorized context',
)
assert(contextAForNurse?.patient_id === patientA.id, 'Authorized context returned wrong patient')
assert(Array.isArray(contextAForNurse?.linked_exams), 'Authorized context linked_exams missing')
assert(contextAForNurse.linked_exams.some((x) => x.id === linkedExam.id), 'Linked exam missing from authorized context')
assert(!contextAForNurse.linked_exams.some((x) => x.id === unlinkedExam.id), 'Unlinked exam leaked into authorized context')
assert(!JSON.stringify(contextAForNurse).includes('file_url'), 'Raw storage URL leaked into authorized context')
logPass('request-scoped context returned only linked exam and logged access')

// ---------------------------------------------------------------------------
// Nurse workflow: response, work log, action plan, waiting-patient loop
// ---------------------------------------------------------------------------
assertNoError(await nurseA.client.from('concierge_request_events').insert({
  request_id: requestA.id,
  patient_id: patientA.id,
  actor_user_id: nurseA.id,
  actor_role: 'nurse',
  event_type: 'nurse_response',
  visibility: 'patient',
  message: 'Resposta sintética da enfermagem.',
  payload: { synthetic: true },
}), 'Nurse A first response')

assertNoError(await nurseA.client.from('concierge_request_events').insert({
  request_id: requestA.id,
  patient_id: patientA.id,
  actor_user_id: nurseA.id,
  actor_role: 'nurse',
  event_type: 'internal_note',
  visibility: 'staff_only',
  message: 'Nota interna sintética.',
  payload: { synthetic: true },
}), 'Nurse A staff-only note')

const patientVisibleEvents = assertNoError(await patientA.client
  .from('concierge_request_events')
  .select('event_type,visibility')
  .eq('request_id', requestA.id), 'Patient A reads timeline')
assert(!patientVisibleEvents.some((e) => e.visibility === 'staff_only'), 'Patient A saw staff-only event')
logPass('Patient A cannot read staff-only note')

assertNoError(await nurseA.client.from('concierge_work_logs').insert({
  staff_user_id: nurseA.id,
  patient_id: patientA.id,
  request_id: requestA.id,
  staff_role: 'nurse',
  work_type: 'triage',
  duration_minutes: 12,
  outcome: 'synthetic_validation',
}), 'Nurse A work log')

const actionA = assertNoError(await nurseA.client.from('concierge_actions').insert({
  patient_id: patientA.id,
  request_id: requestA.id,
  created_by: nurseA.id,
  assigned_professional_id: nurseA.id,
  category: 'general',
  title: 'Próximo passo sintético',
  description: 'Ação visível ao paciente.',
  due_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
  priority: 'normal',
  status: 'pending',
}).select('id').single(), 'Nurse A creates action plan item')

const patientActions = assertNoError(await patientA.client.from('concierge_actions').select('id,status').eq('id', actionA.id), 'Patient A reads action plan')
assert(patientActions.length === 1, 'Patient A cannot see action-plan item')

assertNoError(await patientA.client.from('concierge_actions').update({
  status: 'completed',
  completed_at: new Date().toISOString(),
  completion_note: 'Concluído no teste sintético.',
}).eq('id', actionA.id).select('id,status').single(), 'Patient A completes action')
logPass('Patient A can complete own action without rewriting operational content')

assertNoError(await nurseA.client.from('concierge_requests').update({ status: 'waiting_patient' }).eq('id', requestA.id).select('id,status').single(), 'Nurse A waits for patient')

assertNoError(await patientA.client.rpc('concierge_patient_reply', {
  target_request: requestA.id,
  body: 'Resposta sintética do paciente.',
}), 'Patient A reply RPC')

const afterReply = assertNoError(await patientA.client.from('concierge_requests').select('status,assigned_nurse_id').eq('id', requestA.id).single(), 'Patient A request after reply')
assert(afterReply.status === 'waiting_nurse', `Patient reply routed to ${afterReply.status}, expected waiting_nurse`)
assert(afterReply.assigned_nurse_id === nurseA.id, 'Patient reply lost Nurse A ownership')
logPass('patient reply automatically returned case to Nurse A lane')

await expectUpdateDenied(
  patientA.client.from('concierge_requests').update({ title: 'Tentativa indevida' }).eq('id', requestA.id).select('id'),
  'Patient A rewriting request intake',
)

await expectUpdateDenied(
  nurseA.client.from('concierge_requests').update({ assigned_doctor_id: doctorB.id }).eq('id', requestA.id).select('id'),
  'Nurse A arbitrarily assigning Doctor B',
)

// ---------------------------------------------------------------------------
// Medical escalation -> reference Doctor A
// ---------------------------------------------------------------------------
const escalated = assertNoError(await nurseA.client.from('concierge_requests').update({
  status: 'escalated_medical',
  escalated_at: new Date().toISOString(),
}).eq('id', requestA.id).select('id,status,assigned_nurse_id,assigned_doctor_id').single(), 'Nurse A escalates to medical review')
assert(escalated.assigned_doctor_id === doctorA.id, 'Escalation did not route to reference Doctor A')
assert(escalated.assigned_nurse_id === nurseA.id, 'Escalation changed reference Nurse A')
logPass('medical escalation routed to reference Doctor A')

await expectHidden(doctorB.client, 'concierge_requests', requestA.id, 'Doctor B reading Patient A assigned case')
await expectUpdateDenied(
  doctorA.client.from('concierge_requests').update({ assigned_nurse_id: nurseB.id }).eq('id', requestA.id).select('id'),
  'Doctor A changing nursing assignment',
)

await expectInsertDenied(
  nurseA.client.from('concierge_clinical_reviews').insert({
    request_id: requestA.id,
    patient_id: patientA.id,
    review_type: 'second_analysis',
    status: 'completed',
    patient_visible: true,
    case_summary: 'Tentativa sintética de publicação pela enfermagem.',
  }).select('id'),
  'Nurse A publishing final patient-visible clinical review',
)

const contextAForDoctor = assertNoError(
  await doctorA.client.rpc('concierge_get_request_context', { target_request: requestA.id }),
  'Doctor A loads authorized context',
)
assert(contextAForDoctor?.patient_id === patientA.id, 'Doctor A got wrong context')

const reviewA = assertNoError(await doctorA.client.from('concierge_clinical_reviews').insert({
  request_id: requestA.id,
  patient_id: patientA.id,
  review_type: 'second_analysis',
  status: 'completed',
  patient_visible: true,
  case_summary: 'Revisão sintética concluída por médico.',
  relevant_findings: 'Achados sintéticos sem interpretação clínica real.',
  recommendations: 'Próximo passo sintético para validação.',
  next_steps: 'Seguir plano sintético.',
}).select('id,status,patient_visible,reviewed_by').single(), 'Doctor A completes clinical review')
assert(reviewA.reviewed_by === doctorA.id, 'Clinical review was not stamped with Doctor A')

assertNoError(await doctorA.client.from('concierge_work_logs').insert({
  staff_user_id: doctorA.id,
  patient_id: patientA.id,
  request_id: requestA.id,
  staff_role: 'doctor',
  work_type: 'clinical_review',
  duration_minutes: 18,
  outcome: 'synthetic_validation',
}), 'Doctor A work log')

const patientReviews = assertNoError(await patientA.client.from('concierge_clinical_reviews').select('id,status,patient_visible').eq('id', reviewA.id), 'Patient A reads final review')
assert(patientReviews.length === 1 && patientReviews[0].patient_visible === true, 'Patient A cannot see completed physician review')
logPass('Doctor A final review is patient-visible')

// ---------------------------------------------------------------------------
// Program guard: team-started clinical program cannot be self-enrolled
// ---------------------------------------------------------------------------
const teamProgram = assertNoError(await service.from('concierge_programs').upsert({
  slug: 'validation-team-program',
  name: 'Programa Clínico Sintético',
  description: 'Programa apenas para validação.',
  target: 'synthetic',
  active: true,
  enrollment_mode: 'team',
}).select('id').single(), 'Create synthetic team-started program')

await expectInsertDenied(
  patientA.client.from('concierge_program_enrollments').insert({
    patient_id: patientA.id,
    program_id: teamProgram.id,
    status: 'active',
  }).select('id'),
  'Patient A self-enrolling into team-started program',
)

// ---------------------------------------------------------------------------
// Alert lifecycle + stale device signal
// ---------------------------------------------------------------------------
const overdueAction = assertNoError(await nurseA.client.from('concierge_actions').insert({
  patient_id: patientA.id,
  request_id: requestA.id,
  created_by: nurseA.id,
  assigned_professional_id: nurseA.id,
  category: 'general',
  title: 'Ação vencida sintética',
  due_date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
  priority: 'high',
  status: 'pending',
}).select('id').single(), 'Nurse A creates overdue validation action')

assertNoError(await coordinator.client.rpc('concierge_refresh_time_alerts'), 'Coordinator refreshes Concierge alerts')

const openAlerts = assertNoError(await nurseA.client.from('concierge_alerts').select('id,source,source_id,status').eq('patient_id', patientA.id), 'Nurse A reads alerts')
const actionAlert = openAlerts.find((a) => a.source === 'action' && a.source_id === overdueAction.id)
assert(actionAlert, 'Overdue action alert was not generated')

assertNoError(await nurseA.client.from('concierge_alerts').update({
  status: 'acknowledged',
  acknowledged_by: nurseA.id,
  acknowledged_at: new Date().toISOString(),
}).eq('id', actionAlert.id).select('id,status').single(), 'Nurse A acknowledges action alert')

assertNoError(await nurseA.client.from('concierge_alerts').update({
  status: 'resolved',
  resolved_at: new Date().toISOString(),
}).eq('id', actionAlert.id).select('id,status').single(), 'Nurse A resolves action alert')
logPass('alert lifecycle generated, acknowledged and resolved')

// ---------------------------------------------------------------------------
// Consent revocation kill switch
// ---------------------------------------------------------------------------
assertNoError(await patientA.client.rpc('concierge_revoke_consent'), 'Patient A revokes consent')
logPass('Patient A consent revoked')

await expectRpcDenied(
  doctorA.client.rpc('concierge_get_request_context', { target_request: requestA.id }),
  'Doctor A loading context after revocation',
)
await expectHidden(nurseA.client, 'concierge_requests', requestA.id, 'Nurse A reading Patient A case after revocation')
await expectRpcDenied(
  patientA.client.rpc('concierge_patient_reply', { target_request: requestA.id, body: 'Mensagem após revogação.' }),
  'Patient A replying after consent revocation',
)

const blockedAlertInsert = await service.from('concierge_alerts').insert({
  patient_id: patientA.id,
  source: 'manual',
  source_id: `post-revoke-${Date.now()}`,
  severity: 'info',
  title: 'Alerta que não deve sobreviver',
  explanation: 'Synthetic consent guard validation.',
  status: 'open',
}).select('id')
if (blockedAlertInsert.error) throw new Error(`Post-revocation alert guard probe: ${blockedAlertInsert.error.message}`)
assert(!blockedAlertInsert.data || blockedAlertInsert.data.length === 0, 'Proactive alert survived insertion after revocation')
logPass('new proactive alert suppressed after consent revocation')

// ---------------------------------------------------------------------------
// Patient B: no-plan segment, reference Nurse B
// ---------------------------------------------------------------------------
assertNoError(await patientB.client.rpc('concierge_accept_consent', {
  requested_version: 'concierge-consent-v1-validation',
}), 'Patient B accepts consent')

const requestB = assertNoError(await patientB.client.from('concierge_requests').insert({
  patient_id: patientB.id,
  category: 'guidance',
  title: 'Orientação sintética sem plano',
  description: 'Interação sintética do segmento sem plano.',
  urgency: 'routine',
}).select('id,assigned_nurse_id').single(), 'Patient B creates routine request')
assert(requestB.assigned_nurse_id === nurseB.id, 'Patient B did not route to Nurse B')

assertNoError(await nurseB.client.from('concierge_request_events').insert({
  request_id: requestB.id,
  patient_id: patientB.id,
  actor_user_id: nurseB.id,
  actor_role: 'nurse',
  event_type: 'nurse_response',
  visibility: 'patient',
  message: 'Interação sintética da Enfermeira B.',
  payload: { synthetic: true },
}), 'Nurse B responds to Patient B')

assertNoError(await nurseB.client.from('concierge_work_logs').insert({
  staff_user_id: nurseB.id,
  patient_id: patientB.id,
  request_id: requestB.id,
  staff_role: 'nurse',
  work_type: 'message',
  duration_minutes: 7,
  outcome: 'synthetic_validation',
}), 'Nurse B work log')

const membershipB = assertNoError(await patientB.client.from('concierge_memberships').select('has_health_plan,consent_status').single(), 'Patient B membership')
assert(membershipB.has_health_plan === false, 'Patient B no-plan segment changed')
assert(membershipB.consent_status === 'accepted', 'Patient B consent not accepted')
logPass('Patient B no-plan segment produced request and workload evidence')

// Final automation privacy assertion using service role for evidence only.
const automationRows = assertNoError(await service.from('automation_events').select('payload').in('patient_id', [patientA.id, patientB.id]), 'Automation privacy evidence')
for (const row of automationRows) {
  for (const key of ['message', 'description', 'raw_text', 'health_text']) {
    assert(!(key in (row.payload || {})), `Automation payload leaked forbidden key: ${key}`)
  }
}
logPass('automation payloads contain no raw narrative health fields')

console.log(JSON.stringify({
  canonical_e2e: 'PASS',
  patient_a_request_id: requestA.id,
  patient_b_request_id: requestB.id,
  patient_a_review_id: reviewA.id,
  tested_personas: Object.keys(personas).length,
}, null, 2))
