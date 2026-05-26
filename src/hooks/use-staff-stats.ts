'use client'

import { useQuery } from '@tanstack/react-query'

export interface StaffDeliveryStat {
  staff_id: string
  staff_name: string
  total_assigned: number
  delivered: number
  missed: number
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
    staleTime: 1000 * 60 * 2,
  })
}
