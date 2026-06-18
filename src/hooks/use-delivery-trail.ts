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

export function useDeliveryTrail(city: string) {
  return useQuery<DeliveryTrailResponse>({
    queryKey: ['delivery-trail', city],
    queryFn: async () => {
      const params = new URLSearchParams({ city })
      const res = await fetch(`/api/live/delivery-trail?${params}`)
      if (!res.ok) return { markers: [], activities: [] }
      return res.json()
    },
    refetchInterval: 5000,
    staleTime: 4000,
  })
}
