'use client'

import { useQuery } from '@tanstack/react-query'
import type { SurveyUnit, FilterState } from '@/types'

export function useSurveyData(filters: FilterState, page = 1, pageSize = 50) {
  return useQuery({
    queryKey: ['surveys', filters, page, pageSize],
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
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))

      const res = await fetch(`/api/surveys?${params}`)
      if (!res.ok) throw new Error('Failed to fetch surveys')
      const json = await res.json()
      return { data: (json.data || []) as SurveyUnit[], total: json.total as number }
    },
    staleTime: 5 * 60 * 1000,
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
    staleTime: 5 * 60 * 1000,
  })
}
