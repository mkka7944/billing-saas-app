'use client'

import { useQuery, keepPreviousData } from '@tanstack/react-query'

export interface DeliveryMarker {
  psid: string
  survey_id: string | null
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
  survey_id: string | null
  psid: string
  status: 'delivered' | 'missed' | 'processing'
  delivered_at: string
  time_label: string
}

export interface StaffSummaryEntry {
  staff_id: string
  total_actioned: number
  delivered: number
  missed: number
  processing: number
  assigned: number
  pending: number
  target_per_day: number | null
}

export interface UCStat {
  uc_name: string
  delivered: number
  missed: number
  processing: number
  total_assigned: number
  rate: number
}

interface DeliveryTrailResponse {
  markers: DeliveryMarker[]
  activities: ActivityEvent[]
  total?: number
  staffSummary?: Record<string, StaffSummaryEntry>
  ucSummary?: UCStat[]
}

import { useSettings } from '@/hooks/use-settings'

export function useDeliveryTrail(city: string, date?: string | null, limit?: number, offset?: number) {
  const { data: settings } = useSettings()
  const enabled = settings?.live_polling_enabled !== false && !!city
  const interval = Math.max(10000, (settings?.live_poll_interval || 60) * 1000)
  const shouldPoll = !date

  const queryLimit = limit || 50
  const queryOffset = offset || 0

  return useQuery<DeliveryTrailResponse>({
    queryKey: ['delivery-trail', city, date || 'today', queryLimit, queryOffset],
    queryFn: async () => {
      const params = new URLSearchParams({ city })
      if (date) params.set('date', date)
      params.set('limit', String(queryLimit))
      params.set('offset', String(queryOffset))
      const res = await fetch(`/api/live/delivery-trail?${params}`)
      if (!res.ok) return { markers: [], activities: [] }
      return res.json()
    },
    placeholderData: keepPreviousData,
    refetchInterval: enabled && shouldPoll ? interval : false,
    staleTime: Math.max(interval - 5000, 5000),
    enabled: !!city,
  })
}
