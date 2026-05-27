'use client'

import { useQuery } from '@tanstack/react-query'
import type { FinanceSummary } from '@/types'
import { currentMonth } from '@/lib/constants'

export function useBillingStats(month?: string, district?: string | null, tehsil?: string | null) {
  const billMonth = month || currentMonth()

  return useQuery<FinanceSummary>({
    queryKey: ['billing-stats', billMonth, district, tehsil],
    queryFn: async () => {
      const params = new URLSearchParams({ month: billMonth })
      if (district) params.set('district', district)
      if (tehsil) params.set('tehsil', tehsil)
      const res = await fetch(`/api/billing-stats?${params}`)
      if (!res.ok) throw new Error('Failed to fetch billing stats')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}
