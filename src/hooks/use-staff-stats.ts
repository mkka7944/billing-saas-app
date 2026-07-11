'use client'

import { useQuery } from '@tanstack/react-query'
import { STALE_TIMES } from '@/lib/queries/constants'

export interface StaffDeliveryStat {
  staff_id: string
  staff_name: string
  total_assigned: number
  delivered: number
  missed: number
  pending: number
  rate: number
}

export interface UCViewStat {
  uc_name: string
  total_assigned: number
  staff_count: number
  delivered: number
  missed: number
  processing: number
  pending: number
  rate: number
}

export function useStaffStats(staffId?: string, from?: string, to?: string) {
  return useQuery<StaffDeliveryStat[]>({
    queryKey: ['staff-stats', staffId, from, to],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (staffId) params.set('staff_id', staffId)
      if (from) params.set('from', from)
      if (to) params.set('to', to)

      const res = await fetch(`/api/staff/stats?${params}`)
      if (!res.ok) throw new Error('Failed to fetch staff stats')
      const json = await res.json()
      return json.data || []
    },
    staleTime: STALE_TIMES.PERFORMANCE,
  })
}

export function useUCStats(from?: string, to?: string) {
  return useQuery<UCViewStat[]>({
    queryKey: ['uc-stats', from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ view: 'uc' })
      if (from) params.set('from', from)
      if (to) params.set('to', to)

      const res = await fetch(`/api/staff/stats?${params}`)
      if (!res.ok) throw new Error('Failed to fetch UC stats')
      const json = await res.json()
      return json.data || []
    },
    staleTime: STALE_TIMES.PERFORMANCE,
  })
}
