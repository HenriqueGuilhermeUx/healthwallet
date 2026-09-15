import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.CONCIERGE_VALIDATION_PASSWORD

if (!url || !anonKey || !serviceRoleKey || !password) {
  throw new Error('Missing local Supabase validation environment')
}

const emails = {
  patientA: 'concierge.patient.a@healthwallet.test',
  nurseA: 'concierge.nurse.a@healthwallet.test',
  doctorA: 'concierge.doctor.a@healthwallet.test',
  doctorB: 'concierge.doctor.b@healthwallet.test',
}

const clientFor = () => createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const service = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

async function signIn(email) {
  const client = clientFor()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn ${email}: ${error.message}`)
  if (!data.user?.id) throw new Error(`No user id for ${email}`)
  return { client, id: data.user.id }
}

const patientA = await signIn(emails.patientA)
const nurseA = await signIn(emails.nurseA)
const doctorA = await signIn(emails.doctorA)
const doctorB = await signIn(emails.doctorB)

const nurseRole = await nurseA.client.rpc('concierge_has_staff_role', { required_roles: ['nurse'] })
if (nurseRole.error) throw new Error(`Nurse role RPC: ${nurseRole.error.message}`)
if (nurseRole.data !== true) throw new Error('Runtime identity mismatch: Nurse A is not seen as nurse')

const coordinatorRole = await nurseA.client.rpc('concierge_has_staff_role', { required_roles: ['care_coordinator', 'admin'] })
if (coordinatorRole.error) throw new Error(`Coordinator role RPC: ${coordinatorRole.error.message}`)
if (coordinatorRole.data !== false) throw new Error('Runtime identity mismatch: Nurse A unexpectedly has coordinator/admin role')

console.log(`PASS: runtime Auth sees Nurse A as nurse (${nurseA.id}) and not coordinator/admin`)

let probeRequestId = null
try {
  const membership = await service
    .from('concierge_memberships')
    .update({
      consent_status: 'accepted',
      consented_at: new Date().toISOString(),
      consent_revoked_at: null,
      status: 'pilot',
    })
    .eq('patient_id', patientA.id)
    .select('id')
    .single()
  if (membership.error) throw new Error(`Probe consent setup: ${membership.error.message}`)

  const created = await service
    .from('concierge_requests')
    .insert({
      patient_id: patientA.id,
      category: 'guidance',
      title: 'Runtime assignment probe',
      description: 'Synthetic disposable authorization probe.',
      urgency: 'routine',
      metadata: { validation_assignment_probe: true },
    })
    .select('id,status,assigned_nurse_id,assigned_doctor_id')
    .single()
  if (created.error) throw new Error(`Probe request create: ${created.error.message}`)
  probeRequestId = created.data.id

  if (created.data.assigned_nurse_id !== nurseA.id) {
    throw new Error(`Probe routing mismatch: expected Nurse A ${nurseA.id}, got ${created.data.assigned_nurse_id}`)
  }
  if (created.data.assigned_doctor_id !== null) {
    throw new Error(`Probe unexpectedly started with physician ${created.data.assigned_doctor_id}`)
  }

  const referenceTeam = await nurseA.client.rpc('concierge_reference_team', { target_patient: patientA.id })
  if (referenceTeam.error) throw new Error(`Reference-team probe: ${referenceTeam.error.message}`)
  const referenceDoctor = referenceTeam.data?.find((row) => row.assignment_role === 'doctor')
  if (!referenceDoctor || referenceDoctor.professional_id !== doctorA.id) {
    throw new Error(`Reference-team mismatch: expected Doctor A ${doctorA.id}`)
  }
  if (referenceDoctor.professional_id === doctorB.id) {
    throw new Error('Reference-team corruption: Doctor B is reported as Patient A reference physician')
  }
  console.log(`PASS: Patient A reference physician is Doctor A (${doctorA.id}), not Doctor B (${doctorB.id})`)

  const attempted = await nurseA.client
    .from('concierge_requests')
    .update({ assigned_doctor_id: doctorB.id })
    .eq('id', probeRequestId)
    .select('id,status,assigned_nurse_id,assigned_doctor_id')

  if (attempted.error) {
    console.log(`PASS: Nurse A -> Doctor B direct assignment rejected: ${attempted.error.message}`)
  } else {
    const persisted = await service
      .from('concierge_requests')
      .select('id,status,assigned_nurse_id,assigned_doctor_id')
      .eq('id', probeRequestId)
      .single()
    if (persisted.error) throw new Error(`Probe persisted-state read: ${persisted.error.message}`)

    console.error('DIAGNOSTIC: PostgREST returned success for forbidden assignment')
    console.error(JSON.stringify({
      attempted_return: attempted.data,
      persisted_state: persisted.data,
      expected_nurse: nurseA.id,
      expected_reference_doctor: doctorA.id,
      forbidden_doctor: doctorB.id,
    }, null, 2))

    if (persisted.data.assigned_doctor_id === doctorB.id) {
      throw new Error('AUTHORIZATION_BREACH: Nurse A persisted Doctor B despite enabled assignment guards')
    }

    throw new Error(`TEST_SEMANTICS_MISMATCH: update returned success but persisted physician is ${persisted.data.assigned_doctor_id ?? 'NULL'}`)
  }
} finally {
  if (probeRequestId) {
    const cleanupRequest = await service.from('concierge_requests').delete().eq('id', probeRequestId)
    if (cleanupRequest.error) console.error(`Probe request cleanup failed: ${cleanupRequest.error.message}`)
  }

  const cleanupMembership = await service
    .from('concierge_memberships')
    .update({
      consent_status: 'pending',
      consented_at: null,
      consent_revoked_at: null,
      consent_version: null,
      status: 'pilot',
    })
    .eq('patient_id', patientA.id)
  if (cleanupMembership.error) console.error(`Probe membership cleanup failed: ${cleanupMembership.error.message}`)
}

console.log(JSON.stringify({ assignment_runtime_probe: 'PASS' }, null, 2))
