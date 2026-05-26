'use client'

import { useQuery } from '@tanstack/react-query'
import type { FilterState } from '@/types'

export interface AggregationRow {
  level: 'district' | 'tehsil' | 'uc' | 'unit'
  district: string
  tehsil?: string
  uc_name?: string
  total_units: number
  active: number
  billed: number
  paid: number
  collected: number
  surveyors: number
  no_coords: number
}

export interface DeliveryKpis {
  total_assigned: number
  total_delivered: number
  delivery_rate: number
  total_photos: number
  staff_with_deliveries: number
}

export interface DataInsightResponse {
  kpis: {
    total_units: number
    active_units: number
    archived_units: number
    billed_units: number
    paid_units: number
    total_collected: number
    unique_surveyors: number
    no_coords: number
  }
  delivery_kpis: DeliveryKpis
  rows: AggregationRow[]
  total: number
}

interface UseDataInsightParams {
  filters: FilterState
  page: number
  pageSize: number
}

export function useDataInsight({ filters, page, pageSize }: UseDataInsightParams) {
  return useQuery<DataInsightResponse>({
    queryKey: ['data-insight', filters, page, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.districts.length) params.set('district', filters.districts[0])
      if (filters.tehsils.length) params.set('tehsil', filters.tehsils[0])
      if (filters.ucs.length) params.set('uc', filters.ucs[0])
      if (filters.surveyor) params.set('surveyor', filters.surveyor)
      if (filters.billMonth) params.set('billMonth', filters.billMonth)
      params.set('status', 'active')
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))

      const res = await fetch(`/api/data-insight?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `API error ${res.status}`)
      }
      return res.json()
    },
    staleTime: 1000 * 60 * 5,
  })
}
