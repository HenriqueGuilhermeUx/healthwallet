import { supabase } from '@/lib/supabase'

export async function listConciergeProgramsForStaff() {
  const { data, error } = await supabase
    .from('concierge_programs')
    .select('*')
    .eq('active', true)
    .order('name', { ascending: true })

  if (error) throw error
  return data || []
}

export async function listPatientProgramEnrollments(patientId: string) {
  const { data, error } = await supabase
    .from('concierge_program_enrollments')
    .select('*, concierge_programs(*)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function assignConciergeProgram(input: {
  patientId: string
  program: any
  staffUserId: string
}) {
  const { data, error } = await supabase
    .from('concierge_program_enrollments')
    .upsert({
      patient_id: input.patientId,
      program_id: input.program.id,
      assigned_by: input.staffUserId,
      status: 'active',
      goals: input.program.default_goals || [],
      metadata: {
        enrolled_from: 'concierge_case_workspace',
        enrollment_mode: 'team',
      },
    }, { onConflict: 'patient_id,program_id' })
    .select('*')
    .single()

  if (error) throw error
  return data
}
