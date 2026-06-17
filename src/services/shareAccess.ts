import { supabase } from '@/lib/supabase'

function generateAccessCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export async function createProfessionalShare(userId: string) {
  const accessCode = generateAccessCode()

  const { data, error } = await supabase
    .from('shared_access')
    .insert({
      patient_id: userId,
      access_code: accessCode,
      professional_email: null,
      permissions: {
        summary: true,
        exams: true,
        medications: true,
        timeline: true,
      },
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single()

  if (error) throw error

  return data
}
