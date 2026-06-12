'use client'

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import type { SurveyUnit, FilterState, BillInfo } from '@/types'
import { MAP_PAGE_SIZE } from '@/lib/queries/constants'

export function useSurveyData(filters: FilterState, page = 1, pageSize = 50, showAll = false) {
  const actualPage = showAll ? 1 : page
  const actualPageSize = showAll ? MAP_PAGE_SIZE : pageSize

  return useQuery({
    queryKey: ['surveys', filters, actualPage, actualPageSize],
    queryFn: async () => {
      const params = new URLSearchParams()
      for (const d of filters.districts) params.append('district', d)
      for (const t of filters.tehsils) params.append('tehsil', t)
      for (const u of filters.ucs) params.append('uc', u)
      if (filters.surveyor) params.set('surveyor', filters.surveyor)
      if (filters.unitType) params.set('unitType', filters.unitType)
      if (filters.search) params.set('search', filters.search)
      if (filters.billMonth) params.set('billMonth', filters.billMonth)
      if (filters.paymentStatus !== 'all') params.set('paymentStatus', filters.paymentStatus)
      params.set('sortField', filters.sort.field)
      params.set('sortDirection', filters.sort.direction)
      params.set('page', String(actualPage))
      params.set('pageSize', String(actualPageSize))

      const res = await fetch(`/api/surveys?${params}`)
      if (!res.ok) throw new Error('Failed to fetch surveys')
      const json = await res.json()
      return { data: (json.data || []) as SurveyUnit[], total: json.total as number }
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useSurveyById(id: string | null) {
  return useQuery({
    queryKey: ['survey', id],
    queryFn: async () => {
      if (!id) return null
      const res = await fetch(`/api/surveys?id=${id}`)
      if (!res.ok) throw new Error('Failed to fetch survey')
      const json = await res.json()
      return json.data as SurveyUnit | null
    },
    enabled: !!id,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })
}

export function useSurveyPayments(surveyId: string | null) {
  return useQuery({
    queryKey: ['survey-payments', surveyId],
    queryFn: async () => {
      if (!surveyId) return { bill: null, payments: [] }
      const res = await fetch(`/api/surveys/payments?surveyId=${surveyId}`)
      if (!res.ok) throw new Error('Failed to fetch payments')
      return res.json()
    },
    enabled: !!surveyId,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })
}

export function useSurveyBillInfo(surveyId: string | null) {
  return useQuery({
    queryKey: ['survey-bill-info', surveyId],
    queryFn: async () => {
      if (!surveyId) return null
      const res = await fetch(`/api/surveys/${surveyId}/bill-info`)
      if (!res.ok) throw new Error('Failed to fetch bill info')
      return res.json() as Promise<BillInfo>
    },
    enabled: !!surveyId,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })
}
