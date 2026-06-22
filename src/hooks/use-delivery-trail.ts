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

export function useDeliveryTrail(city: string) {
  const { data: settings } = useSettings()
  const enabled = settings?.live_polling_enabled !== false && !!city
  const interval = Math.max(10000, (settings?.live_poll_interval || 60) * 1000)

  return useQuery<DeliveryTrailResponse>({
    queryKey: ['delivery-trail', city],
    queryFn: async () => {
      const params = new URLSearchParams({ city })
      const res = await fetch(`/api/live/delivery-trail?${params}`)
      if (!res.ok) return { markers: [], activities: [] }
      return res.json()
    },
    refetchInterval: enabled ? interval : false,
    staleTime: Math.max(interval - 5000, 5000),
    enabled: !!city,
  })
}
