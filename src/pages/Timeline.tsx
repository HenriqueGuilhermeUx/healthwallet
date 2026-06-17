import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Timeline() {
  const [events, setEvents] = useState<any[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data } = await supabase
      .from('medical_events')
      .select('*')
      .order('event_date', { ascending: false })

    setEvents(data || [])
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">
        Timeline Clínica
      </h1>

      {events.map((event) => (
        <div
          key={event.id}
          className="border-l-4 border-emerald-500 pl-4 mb-6"
        >
          <h3 className="font-bold">
            {event.title}
          </h3>

          <p className="text-sm text-gray-600">
            {event.description}
          </p>

          <small>
            {event.event_date}
          </small>
        </div>
      ))}
    </div>
  )
}
