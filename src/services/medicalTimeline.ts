import { supabase } from '@/lib/supabase'

export async function createMedicalEvent({
  userId,
  type,
  title,
  description,
  eventDate,
}: {
  userId: string
  type: string
  title: string
  description?: string
  eventDate?: string
}) {
  if (!userId || !title) return

  await supabase.from('medical_events').insert({
    user_id: userId,
    type,
    title,
    description: description || '',
    event_date: eventDate || new Date().toISOString().slice(0, 10),
  })
}
