import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.SECURE_SHARING_VALIDATION_PASSWORD

if (!url || !anonKey || !serviceKey || !password) {
  throw new Error('Missing secure sharing local E2E environment variables')
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

const emails = {
  patient: 'secure.share.patient@healthwallet.test',
  professionalA: 'secure.share.prof.a@healthwallet.test',
  professionalB: 'secure.share.prof.b@healthwallet.test',
}

function pass(label, details = '') {
  console.log(`PASS: ${label}${details ? ` — ${details}` : ''}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function createUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  return data.user
}

async function signedInClient(email) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

async function expectNoRows(query, label) {
  const { data, error } = await query
  if (error) throw error
  assert(Array.isArray(data) && data.length === 0, `${label}: expected zero rows`)
  pass(label)
}

async function expectDenied(promise, label) {
  const { data, error } = await promise
  assert(Boolean(error), `${label}: expected denial, got ${JSON.stringify(data)}`)
  pass(label, error.message)
}

const patientUser = await createUser(emails.patient)
const professionalAUser = await createUser(emails.professionalA)
const professionalBUser = await createUser(emails.professionalB)
pass('three synthetic Auth identities created')

const [{ data: profA, error: profAError }, { data: profB, error: profBError }] = await Promise.all([
  admin.from('professionals').insert({
    user_id: professionalAUser.id,
    full_name: 'Professional A',
    cpf: '11111111111',
    professional_register: 'TEST-A',
    register_state: 'SP',
    professional_type: 'medico',
    verification_status: 'verified',
  }).select('id').single(),
  admin.from('professionals').insert({
    user_id: professionalBUser.id,
    full_name: 'Professional B',
    cpf: '22222222222',
    professional_register: 'TEST-B',
    register_state: 'SP',
    professional_type: 'medico',
    verification_status: 'verified',
  }).select('id').single(),
])
if (profAError) throw profAError
if (profBError) throw profBError

const seedResults = await Promise.all([
  admin.from('profiles').insert({ id: patientUser.id, full_name: 'Synthetic Patient', birth_date: '1985-05-10', gender: 'other', blood_type: 'O+', phone: '00000000000', allergies: ['penicillin'] }),
  admin.from('health_summaries').insert({ user_id: patientUser.id, professional_summary: 'Synthetic summary' }),
  admin.from('health_scores').insert({ user_id: patientUser.id, score: 77, status: 'synthetic' }),
  admin.from('medical_records').insert({ user_id: patientUser.id, file_name: 'synthetic.pdf', exam_type: 'synthetic' }),
  admin.from('medications').insert({ user_id: patientUser.id, name: 'Synthetic medication', dosage: '1', frequency: 'daily' }),
  admin.from('health_plans').insert({ user_id: patientUser.id, plan_name: 'Synthetic Plan', card_number: 'TEST' }),
  admin.from('medical_events').insert({ user_id: patientUser.id, title: 'Synthetic event' }),
  admin.from('health_daily_summaries').insert({ user_id: patientUser.id, summary_date: '2026-09-15', device_context_score: 80, device_confidence: 90, steps: 4321 }),
  admin.from('alergias_paciente').insert({ paciente_id: patientUser.id, tipo: 'medicamento', descricao: 'Synthetic allergy' }),
  admin.from('patient_conditions').insert({ paciente_id: patientUser.id, descricao: 'Synthetic condition', ativa: true }),
  admin.from('medication_uses').insert({ paciente_id: patientUser.id, nome: 'Synthetic medication use', ativo: true }),
  admin.from('consultations').insert({ paciente_id: patientUser.id, medico_id: profA.id }),
  admin.from('document_deliveries').insert({ document_type: 'synthetic', recipient_email: emails.patient, document_hash: 'synthetic-hash', confirmation_status: 'pending', delivery_status: 'sent', medico_id: profA.id, paciente_id: patientUser.id }),
])
for (const result of seedResults) if (result.error) throw result.error

const { data: activeIngredient, error: activeIngredientError } = await admin.from('principios_ativos').insert({ nome: 'Synthetic Active', dcb: 'SYN' }).select('id').single()
if (activeIngredientError) throw activeIngredientError
const { data: lab, error: labError } = await admin.from('laboratorios').insert({ nome: 'Synthetic Lab' }).select('id').single()
if (labError) throw labError
const { data: form, error: formError } = await admin.from('formas_farmaceuticas').insert({ descricao: 'Synthetic Form' }).select('id').single()
if (formError) throw formError
const catalogResults = await Promise.all([
  admin.from('exames_tuss').insert({ codigo_tuss: 'TEST', descricao: 'Synthetic Exam', categoria: 'lab', ativo: true }),
  admin.from('medicamentos').insert({ registro_ms: 'TEST', nome_comercial: 'Synthetic Drug', concentracao: '1mg', principio_ativo_id: activeIngredient.id, laboratorio_id: lab.id, forma_farmaceutica_id: form.id, ativo: true }),
])
for (const result of catalogResults) if (result.error) throw result.error
pass('synthetic clinical and catalog rows seeded with service role')

const patient = await signedInClient(emails.patient)
const professionalA = await signedInClient(emails.professionalA)
const professionalB = await signedInClient(emails.professionalB)
pass('patient and professionals authenticated through local Supabase Auth')

await expectDenied(
  anonymous.rpc('create_health_access_code', { p_permissions: { profile: true }, p_duration_hours: 24 }),
  'anonymous caller cannot create a secure health token',
)
await expectDenied(
  anonymous.rpc('redeem_health_access_code', { p_code: 'HW-NOT-A-TOKEN' }),
  'anonymous caller cannot redeem a health token',
)
await expectDenied(
  patient.from('access_codes').insert({ code: '123456', patient_id: patientUser.id, permissions: { profile: true }, expires_at: new Date(Date.now() + 3600000).toISOString() }),
  'patient cannot directly insert legacy bearer codes',
)

const permissions = {
  summary: false,
  profile: true,
  medscore: false,
  exams: false,
  ai_analysis: false,
  medications: true,
  allergies: false,
  passport: false,
  emergency_contact: false,
  health_plan: false,
  family_history: false,
}

const { data: createdRows, error: createError } = await patient.rpc('create_health_access_code', {
  p_permissions: permissions,
  p_duration_hours: 24,
})
if (createError) throw createError
const created = Array.isArray(createdRows) ? createdRows[0] : createdRows
assert(created?.id, 'secure token id missing')
assert(/^HW-[0-9A-F]{36}$/.test(created.code), `unexpected secure token format: ${created.code}`)
pass('patient created server-side cryptographic token', created.code.slice(0, 10) + '…')

await expectDenied(anonymous.from('access_codes').select('id'), 'anonymous cannot enumerate access_codes')
await expectDenied(anonymous.from('shared_access').select('id'), 'anonymous cannot enumerate shared_access')
await expectNoRows(professionalA.from('profiles').select('id').eq('id', patientUser.id), 'professional A has no clinical access before redemption')
await expectNoRows(professionalB.from('profiles').select('id').eq('id', patientUser.id), 'professional B has no clinical access before redemption')

const { data: redeemedRows, error: redeemError } = await professionalA.rpc('redeem_health_access_code', { p_code: created.code })
if (redeemError) throw redeemError
const redeemed = Array.isArray(redeemedRows) ? redeemedRows[0] : redeemedRows
assert(redeemed?.patient_id === patientUser.id, 'redeemed token patient mismatch')
assert(redeemed?.professional_id === profA.id, 'redeemed token professional mismatch')
pass('professional A redeemed token and became the bound professional')

const { data: sharedProfile, error: sharedProfileError } = await professionalA.from('profiles').select('id,full_name').eq('id', patientUser.id)
if (sharedProfileError) throw sharedProfileError
assert(sharedProfile?.length === 1, 'professional A should read authorized profile')
pass('authorized profile category visible to professional A')

const { data: sharedMeds, error: sharedMedsError } = await professionalA.from('medications').select('id').eq('user_id', patientUser.id)
if (sharedMedsError) throw sharedMedsError
assert(sharedMeds?.length === 1, 'professional A should read authorized medications')
pass('authorized medication category visible to professional A')

await expectNoRows(professionalA.from('health_scores').select('id').eq('user_id', patientUser.id), 'non-authorized MedScore category remains hidden')
await expectNoRows(professionalA.from('medical_records').select('id').eq('user_id', patientUser.id), 'non-authorized exam category remains hidden')
await expectNoRows(professionalB.from('profiles').select('id').eq('id', patientUser.id), 'professional B remains isolated after professional A redemption')

const secondRedeem = await professionalB.rpc('redeem_health_access_code', { p_code: created.code })
assert(Boolean(secondRedeem.error) && secondRedeem.error.message.includes('access_code_already_redeemed'), 'professional B should be blocked from reusing professional A token')
pass('second professional cannot reuse a bound token')

const { data: patientAudit, error: auditError } = await patient.from('health_share_access_audit_logs').select('event_type,professional_id').eq('access_code_id', created.id)
if (auditError) throw auditError
assert(patientAudit?.length === 1 && patientAudit[0].event_type === 'redeemed', 'patient redemption audit missing')
pass('patient can audit professional redemption')

const { data: revokedRows, error: revokeError } = await patient.from('access_codes').update({ revoked: true, revoked_at: new Date().toISOString() }).eq('id', created.id).select('id,revoked')
if (revokeError) throw revokeError
assert(revokedRows?.[0]?.revoked === true, 'patient revocation failed')
pass('patient revoked token')

await expectNoRows(professionalA.from('profiles').select('id').eq('id', patientUser.id), 'revocation immediately removes professional profile access')
await expectNoRows(professionalA.from('medications').select('id').eq('user_id', patientUser.id), 'revocation immediately removes professional medication access')

await expectDenied(anonymous.from('patient_device_score_latest').select('user_id'), 'anonymous cannot read device-score view')
await expectDenied(anonymous.from('vw_patient_clinical_context').select('paciente_id'), 'anonymous cannot read clinical-context view')

const { data: patientDeviceView, error: deviceViewError } = await patient.from('patient_device_score_latest').select('user_id,device_context_score')
if (deviceViewError) throw deviceViewError
assert(patientDeviceView?.length === 1 && patientDeviceView[0].user_id === patientUser.id, 'patient security_invoker device view failed')
pass('patient security_invoker device view obeys owner RLS')

const { data: patientContextView, error: contextViewError } = await patient.from('vw_patient_clinical_context').select('paciente_id,n_alergias,n_condicoes,n_medicacoes')
if (contextViewError) throw contextViewError
assert(patientContextView?.length === 1 && patientContextView[0].paciente_id === patientUser.id, 'patient security_invoker clinical-context view failed')
pass('patient security_invoker clinical-context view obeys underlying RLS')

const { data: examCatalog, error: examCatalogError } = await patient.from('vw_exames_autocomplete').select('id')
if (examCatalogError) throw examCatalogError
assert(examCatalog?.length === 1, 'authenticated exam autocomplete should remain available')
const { data: medCatalog, error: medCatalogError } = await patient.from('vw_medicamentos_autocomplete').select('id,forma_farmaceutica')
if (medCatalogError) throw medCatalogError
assert(medCatalog?.length === 1 && medCatalog[0].forma_farmaceutica === 'Synthetic Form', 'authenticated medication autocomplete should preserve joined pharmaceutical form')
pass('authenticated autocomplete views remain functional after security_invoker hardening')

const { data: professionalDocs, error: professionalDocsError } = await professionalA.from('vw_document_deliveries_public').select('id,medico_nome')
if (professionalDocsError) throw professionalDocsError
assert(professionalDocs?.length === 1, 'professional document delivery view should preserve owner access')
pass('professional document-delivery view preserves RLS-authorized owner access')

console.log(JSON.stringify({ secure_health_sharing_e2e: 'PASS' }))
