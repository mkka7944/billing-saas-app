'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface FlaggedPsidEntry {
  id: number
  psid: string
  survey_id: string | null
  reason: string
  notes: string | null
  flagged_by: string | null
  flagged_at: string | null
  bill_month: string | null
  city_district: string | null
  tehsil: string | null
  resolved_at: string | null
  resolution: string | null
}

interface ListResponse {
  data: FlaggedPsidEntry[]
  total: number
  page: number
  pageSize: number
}

interface StatsResponse {
  byReason: { reason: string; count: number }[]
  totalUnresolved: number
  cities: string[]
}

interface ListParams {
  page?: number
  pageSize?: number
  reason?: string
  city?: string
  tehsil?: string
  dateFrom?: string
  dateTo?: string
  unresolvedOnly?: boolean
  search?: string
}

export function useFlaggedPsids(params: ListParams) {
  const sp = new URLSearchParams()
  if (params.page) sp.set('page', String(params.page))
  if (params.pageSize) sp.set('pageSize', String(params.pageSize))
  if (params.reason) sp.set('reason', params.reason)
  if (params.city) sp.set('city', params.city)
  if (params.tehsil) sp.set('tehsil', params.tehsil)
  if (params.dateFrom) sp.set('dateFrom', params.dateFrom)
  if (params.dateTo) sp.set('dateTo', params.dateTo)
  if (params.unresolvedOnly === false) sp.set('unresolvedOnly', 'false')
  if (params.search) sp.set('search', params.search)

  return useQuery<ListResponse>({
    queryKey: ['admin-flagged-psids', params],
    queryFn: async () => {
      const res = await fetch(`/api/admin/flagged-psids?${sp.toString()}`)
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    staleTime: 30_000,
  })
}

export function useFlaggedPsidsStats() {
  return useQuery<StatsResponse>({
    queryKey: ['admin-flagged-psids-stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/flagged-psids?stats=true')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    staleTime: 60_000,
  })
}

export function useResolveFlagged() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      resolved,
      notes,
      reason,
      resolution,
    }: {
      id: number
      resolved?: boolean
      notes?: string | null
      reason?: string
      resolution?: string
    }) => {
      const res = await fetch(`/api/admin/flagged-psids/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved, notes, reason, resolution }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-flagged-psids'] })
      qc.invalidateQueries({ queryKey: ['admin-flagged-psids-stats'] })
    },
  })
}
