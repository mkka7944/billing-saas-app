'use client'

import { useQuery } from '@tanstack/react-query'

export interface DeliveryMarker {
  psid: string
  status: 'delivered' | 'missed' | 'processing'
  delivered_at: string | null
  lat: number
  lng: number
  uc_name: string | null
  consumer_name: string
  staff_name: string
  staff_id: string | null
}

export interface ActivityEvent {
  staff_name: string
  psid: string
  status: 'delivered' | 'missed' | 'processing'
  delivered_at: string
  time_label: string
}

interface DeliveryTrailResponse {
  markers: DeliveryMarker[]
  activities: ActivityEvent[]
}

import { useSettings } from '@/hooks/use-settings'

export function useDeliveryTrail(city: string, date?: string | null) {
  const { data: settings } = useSettings()
  const enabled = settings?.live_polling_enabled !== false && !!city
  const interval = Math.max(10000, (settings?.live_poll_interval || 60) * 1000)
  const shouldPoll = !date

  return useQuery<DeliveryTrailResponse>({
    queryKey: ['delivery-trail', city, date || 'today'],
    queryFn: async () => {
      const params = new URLSearchParams({ city })
      if (date) params.set('date', date)
      const res = await fetch(`/api/live/delivery-trail?${params}`)
      if (!res.ok) return { markers: [], activities: [] }
      return res.json()
    },
    refetchInterval: enabled && shouldPoll ? interval : false,
    staleTime: Math.max(interval - 5000, 5000),
    enabled: !!city,
  })
}
