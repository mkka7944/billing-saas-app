'use client'

import { useQuery } from '@tanstack/react-query'
import { useBillingStore } from '@/stores/billing-store'
import { currentMonth } from '@/lib/constants'
import type { BillingChartsData } from '@/types'

export function useBillingCharts() {
  const selectedCity = useBillingStore((s) => s.selectedCity)
  const tehsil = useBillingStore((s) => s.filters.tehsils[0] ?? null)
  const month = useBillingStore((s) => s.filters.billMonth ?? currentMonth())

  return useQuery<BillingChartsData>({
    queryKey: ['billing-charts', selectedCity, tehsil, month],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (tehsil) params.set('tehsil', tehsil)
      if (month) params.set('month', month)
      const res = await fetch(`/api/billing-charts?${params}`)
      if (!res.ok) throw new Error('Failed to fetch billing charts')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}
