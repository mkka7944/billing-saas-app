'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { SurveyUnit, FilterState } from '@/types'

export function useSurveyData(filters: FilterState, page = 1, pageSize = 50) {
  return useQuery({
    queryKey: ['surveys', filters, page, pageSize],
    queryFn: async () => {
      const supabase = createClient()

      let query = supabase
        .from('survey_units')
        .select('survey_id, consumer_name, address, lat, lng, image_urls, city_district, tehsil, uc_name, uc_type, unit_type, surveyor_name, survey_date, monthly_fee, billing_category, status, category, sub_category, house_type', { count: 'exact' })
        .eq('status', 'ACTIVE')

      if (filters.districts.length) query = query.in('city_district', filters.districts)
      if (filters.tehsils.length) query = query.in('tehsil', filters.tehsils)
      if (filters.ucs.length) query = query.in('uc_name', filters.ucs)
      if (filters.surveyor) query = query.eq('surveyor_name', filters.surveyor)
      if (filters.unitType) query = query.eq('unit_type', filters.unitType)
      if (filters.search) {
        query = query.or(`consumer_name.ilike.%${filters.search}%,survey_id.ilike.%${filters.search}%`)
      }

      const from = (page - 1) * pageSize
      const { data, count, error } = await query
        .order('consumer_name', { ascending: true })
        .range(from, from + pageSize - 1)

      if (error) throw error

      if (filters.paymentStatus !== 'all' && data?.length) {
        const surveyIds = data.map((s: { survey_id: string }) => s.survey_id)
        const month = getCurrentBillMonth()

        const { data: bills } = await supabase
          .from('bills')
          .select('survey_id, payment_status')
          .eq('bill_month', month)
          .in('survey_id', surveyIds)

        const paidMap = new Map((bills || []).map((b: { survey_id: string; payment_status: string | null }) => [b.survey_id, b.payment_status?.toLowerCase()]))

        const filtered = data.filter((s: { survey_id: string }) => {
          const status = paidMap.get(s.survey_id) || 'unpaid'
          if (filters.paymentStatus === 'paid') return status === 'paid'
          if (filters.paymentStatus === 'unpaid') return status === 'unpaid' || status === 'unpaid'
          if (filters.paymentStatus === 'overdue') return status === 'unpaid'
          return true
        })

        return { data: filtered as SurveyUnit[], total: filtered.length }
      }

      return { data: (data || []) as SurveyUnit[], total: count ?? 0 }
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useSurveyById(id: string | null) {
  return useQuery({
    queryKey: ['survey', id],
    queryFn: async () => {
      if (!id) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('survey_units')
        .select('*')
        .eq('survey_id', id)
        .single()

      if (error) throw error
      return data as SurveyUnit
    },
    enabled: !!id,
  })
}

export function useSurveyPayments(surveyId: string | null) {
  return useQuery({
    queryKey: ['survey-payments', surveyId],
    queryFn: async () => {
      if (!surveyId) return []
      const supabase = createClient()
      const { data, error } = await supabase
        .from('bills')
        .select('psid, bill_month, amount_paid, amount_due, payment_status, paid_date, payment_method')
        .eq('survey_id', surveyId)
        .order('bill_month', { ascending: false })
        .limit(12)

      if (error) throw error
      return data || []
    },
    enabled: !!surveyId,
    staleTime: 5 * 60 * 1000,
  })
}

function getCurrentBillMonth(): string {
  const now = new Date()
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return `${months[now.getMonth()]}${now.getFullYear()}`
}
