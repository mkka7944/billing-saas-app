'use client'

import { useQuery } from '@tanstack/react-query'
import type { FinanceSummary } from '@/types'

function currentMonth(): string {
  const m = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const d = new Date()
  return `${m[d.getMonth()]}${d.getFullYear()}`
}

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
