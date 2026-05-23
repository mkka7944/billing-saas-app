import { createClient } from '@/lib/supabase/server'
import type { UCStat } from '@/types'

export interface RecoveryParams {
  month?: string
  district?: string
}

export async function getRecoveryPerformance(params: RecoveryParams = {}) {
  const supabase = await createClient()
  const month = params.month || getCurrentBillMonth()

  let billQuery = supabase
    .from('bills')
    .select('bill_month, payment_status, amount_paid, amount_due, total_payable, survey_id')
    .eq('bill_month', month)

  if (params.district) {
    const { data: surveyIds } = await supabase
      .from('survey_units')
      .select('survey_id')
      .eq('city_district', params.district)
      .eq('status', 'ACTIVE')
    const ids = (surveyIds || []).map((s) => s.survey_id)
    if (ids.length) billQuery = billQuery.in('survey_id', ids)
  }

  const { data: bills, error } = await billQuery
  if (error) throw error

  const surveyIds = [...new Set((bills || []).map((b) => b.survey_id).filter(Boolean))]
  if (!surveyIds.length) return []

  const { data: units } = await supabase
    .from('survey_units')
    .select('survey_id, uc_name, tehsil')
    .in('survey_id', surveyIds)

  const unitMap = new Map((units || []).map((u) => [u.survey_id, u]))

  const ucMap = new Map<string, {
    tehsil: string
    total_units: number
    paying_units: number
    expected_monthly: number
    total_collected_history: number
    paying_surveyIds: Set<string>
  }>()

  for (const bill of bills || []) {
    const unit = unitMap.get(bill.survey_id)
    const ucName = unit?.uc_name || 'Unknown'
    const entry = ucMap.get(ucName) || {
      tehsil: unit?.tehsil || 'Unknown',
      total_units: 0,
      paying_units: 0,
      expected_monthly: 0,
      total_collected_history: 0,
      paying_surveyIds: new Set(),
    }

    entry.total_units++
    entry.expected_monthly += Number(bill.total_payable || bill.amount_due || 0)

    if (bill.payment_status?.toLowerCase() === 'paid') {
      entry.paying_surveyIds.add(bill.survey_id)
      entry.total_collected_history += Number(bill.amount_paid || 0)
    }

    ucMap.set(ucName, entry)
  }

  const result: UCStat[] = Array.from(ucMap.entries()).map(([uc_name, s]) => ({
    uc_name,
    tehsil: s.tehsil,
    total_units: s.total_units,
    paying_units: s.paying_surveyIds.size,
    expected: s.expected_monthly,
    collected: s.total_collected_history,
    rate: s.expected_monthly > 0
      ? Math.round((s.total_collected_history / s.expected_monthly) * 10000) / 100
      : 0,
  }))

  return result.sort((a, b) => a.rate - b.rate)
}

function getCurrentBillMonth(): string {
  const now = new Date()
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return `${months[now.getMonth()]}${now.getFullYear()}`
}
