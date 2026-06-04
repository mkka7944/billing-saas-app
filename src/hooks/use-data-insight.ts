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

export interface FlaggedSummary {
  action: 'DO_NOT_DELIVER' | 'DELIVER' | 'PENDING'
  label: string
  icon: string
  plus_count: number
}

export interface UnitRow {
  survey_id: string
  psid: string
  consumer_name: string | null
  status: string
  surveyor_name: string | null
  survey_date: string | null
  survey_time: string | null
  amount_paid: number
  monthly_fee: number
  arrears: number
  flagged_reason?: string | null
  flagged_notes?: string | null
  flagged_at?: string | null
  flagged_summary?: FlaggedSummary
  flagged_entries?: { psid: string; reason: string; notes: string | null }[]
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
  rows: AggregationRow[]
  unitRows?: UnitRow[]
  total: number
  level: string
}

interface UseDataInsightParams {
  filters: FilterState
  page: number
  pageSize: number
  drillUC?: string | null
  status?: 'active' | 'archived' | 'duplicates'
}

export function useDataInsight({ filters, page, pageSize, drillUC, status }: UseDataInsightParams) {
  return useQuery<DataInsightResponse>({
    queryKey: ['data-insight', filters, page, pageSize, drillUC, status],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.districts.length) params.set('district', filters.districts[0])
      if (filters.tehsils.length) params.set('tehsil', filters.tehsils[0])
      if (filters.ucs.length) params.set('uc', filters.ucs[0])
      if (filters.surveyor) params.set('surveyor', filters.surveyor)
      if (filters.billMonth) params.set('billMonth', filters.billMonth)
      if (drillUC) params.set('drill', drillUC)
      if (status) params.set('status', status)
      if (filters.sort) {
        params.set('sortField', filters.sort.field)
        params.set('sortDirection', filters.sort.direction)
      }
      // Empty string = no status filter, show all units
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
