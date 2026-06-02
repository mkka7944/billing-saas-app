'use client'

import { useQuery } from '@tanstack/react-query'
import { STALE_TIMES } from '@/lib/queries/constants'
import type { UCStatRow } from '@/lib/queries/hierarchy'

export function useUCStats(city: string | null, month?: string) {
  return useQuery({
    queryKey: ['uc-stats', city, month],
    queryFn: async (): Promise<UCStatRow[]> => {
      const params = new URLSearchParams()
      if (city) params.set('city', city)
      if (month) params.set('month', month)
      const res = await fetch(`/api/uc-stats?${params}`)
      if (!res.ok) throw new Error('Failed to fetch UC stats')
      const json = await res.json()
      return json.data || []
    },
    staleTime: STALE_TIMES.BILLING,
  })
}
