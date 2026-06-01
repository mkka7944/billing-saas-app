'use client'

import { useQuery } from '@tanstack/react-query'
import type { OrphanPsidsData } from '@/types'

export function useOrphanPsids(month?: string) {
  return useQuery<OrphanPsidsData>({
    queryKey: ['orphan-psids', month || 'all'],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (month) params.set('month', month)
      const res = await fetch(`/api/orphan-psids?${params}`)
      if (!res.ok) throw new Error('Failed to fetch orphan PSIDs')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}
