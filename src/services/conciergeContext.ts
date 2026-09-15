import { supabase } from '@/lib/supabase'

export async function getConciergeRequestContext(requestId: string) {
  const { data, error } = await supabase.rpc('concierge_get_request_context', {
    target_request: requestId,
  })

  if (error) throw error
  return data || {}
}
