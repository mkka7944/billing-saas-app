'use client'

import { useQuery } from '@tanstack/react-query'

export function useBillMonths() {
  return useQuery<string[]>({
    queryKey: ['bill-months'],
    queryFn: async () => {
      const res = await fetch('/api/bill-months')
      if (!res.ok) return []
      const json = await res.json()
      return json.months || []
    },
    staleTime: 60 * 60 * 1000,
  })
}
