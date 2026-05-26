'use client'

import { useQuery } from '@tanstack/react-query'
import type { FinanceSummary } from '@/types'
import { currentMonth } from '@/lib/constants'

export function useBillingStats(month?: string) {
  const billMonth = month || currentMonth()

  return useQuery<FinanceSummary>({
    queryKey: ['billing-stats', billMonth],
    queryFn: async () => {
      const res = await fetch(`/api/billing-stats?month=${billMonth}`)
      if (!res.ok) throw new Error('Failed to fetch billing stats')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}
