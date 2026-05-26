'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface StaffPerformance {
  id: string
  staff_id: string
  assigned_date: string
  rating: number | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

const BASE = '/api/staff/performance'

export function useStaffPerformance(staffId?: string, from?: string, to?: string) {
  return useQuery<StaffPerformance[]>({
    queryKey: ['staff-performance', staffId, from, to],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (staffId) params.set('staff_id', staffId)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(`${BASE}?${params}`)
      if (!res.ok) throw new Error('Failed to fetch performance')
      const json = await res.json()
      return json.data || []
    },
    staleTime: 1000 * 60 * 2,
  })
}

export function useSavePerformance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { staff_id: string; assigned_date: string; rating?: number; notes?: string }) => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-performance'] }),
  })
}
