import { createClient } from '@/lib/supabase/server'
import type { FinanceSummary, TehsilStat, UCStat, CategoryStat } from '@/types'

export interface FinanceParams {
  month?: string
  district?: string
  tehsil?: string
}

export async function getFinanceSummary(params: FinanceParams = {}) {
  const supabase = await createClient()
  const month = params.month || getCurrentBillMonth()

  let billQuery = supabase
    .from('bills')
    .select('bill_month, payment_status, amount_paid, amount_due, fine, total_payable, survey_id, billing_category, category')
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

  if (params.tehsil) {
    const { data: surveyIds } = await supabase
      .from('survey_units')
      .select('survey_id')
      .eq('tehsil', params.tehsil)
      .eq('status', 'ACTIVE')
    const ids = (surveyIds || []).map((s) => s.survey_id)
    if (ids.length) billQuery = billQuery.in('survey_id', ids)
  }

  const { data: bills, error } = await billQuery
  if (error) throw error

  const paidBills = bills?.filter((b) => b.payment_status?.toLowerCase() === 'paid') || []
  const totalCollected = paidBills.reduce((sum, b) => sum + Number(b.amount_paid || 0), 0)
  const totalExpected = bills?.reduce((sum, b) => sum + Number(b.total_payable || b.amount_due || 0), 0) || 0

  const grand_totals = {
    total_units: bills?.length || 0,
    total_paying: paidBills.length,
    total_collected: totalCollected,
    total_expected: totalExpected,
    recovery_rate: totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 10000) / 100 : 0,
  }

  const { data: allUnits } = await supabase
    .from('survey_units')
    .select('survey_id, tehsil')
    .eq('status', 'ACTIVE')
    .in('survey_id', bills?.map((b) => b.survey_id) || [])

  const unitTehsilMap = new Map((allUnits || []).map((u) => [u.survey_id, u.tehsil]))

  const tehsilMap = new Map<string, { total: number; paid: number; collected: number; expected: number }>()
  for (const bill of bills || []) {
    const t = unitTehsilMap.get(bill.survey_id) || 'Unknown'
    const entry = tehsilMap.get(t) || { total: 0, paid: 0, collected: 0, expected: 0 }
    entry.total++
    if (bill.payment_status?.toLowerCase() === 'paid') {
      entry.paid++
      entry.collected += Number(bill.amount_paid || 0)
    }
    entry.expected += Number(bill.total_payable || bill.amount_due || 0)
    tehsilMap.set(t, entry)
  }

  const tehsil_stats: TehsilStat[] = Array.from(tehsilMap.entries()).map(([tehsil, s]) => ({
    tehsil,
    total_units: s.total,
    paying_units: s.paid,
    expected: s.expected,
    collected: s.collected,
    rate: s.expected > 0 ? Math.round((s.collected / s.expected) * 10000) / 100 : 0,
  }))

  const ucStatsMap = new Map<string, { tehsil: string; total: number; paid: number; collected: number; expected: number }>()
  for (const bill of bills || []) {
    const { data: unit } = await supabase
      .from('survey_units')
      .select('uc_name, tehsil')
      .eq('survey_id', bill.survey_id)
      .single()
    if (!unit) continue
    const key = unit.uc_name || 'Unknown'
    const entry = ucStatsMap.get(key) || { tehsil: unit.tehsil || 'Unknown', total: 0, paid: 0, collected: 0, expected: 0 }
    entry.total++
    if (bill.payment_status?.toLowerCase() === 'paid') {
      entry.paid++
      entry.collected += Number(bill.amount_paid || 0)
    }
    entry.expected += Number(bill.total_payable || bill.amount_due || 0)
    ucStatsMap.set(key, entry)
  }

  const uc_stats: UCStat[] = Array.from(ucStatsMap.entries()).map(([name, s]) => ({
    uc_name: name,
    tehsil: s.tehsil,
    total_units: s.total,
    paying_units: s.paid,
    expected: s.expected,
    collected: s.collected,
    rate: s.expected > 0 ? Math.round((s.collected / s.expected) * 10000) / 100 : 0,
  }))

  const catMap = new Map<string, { total: number; paid: number; collected: number }>()
  for (const bill of bills || []) {
    const cat = bill.category || 'Unknown'
    const entry = catMap.get(cat) || { total: 0, paid: 0, collected: 0 }
    entry.total++
    if (bill.payment_status?.toLowerCase() === 'paid') {
      entry.paid++
      entry.collected += Number(bill.amount_paid || 0)
    }
    catMap.set(cat, entry)
  }

  const category_stats: CategoryStat[] = Array.from(catMap.entries()).map(([category, s]) => ({
    category,
    total_units: s.total,
    paying_units: s.paid,
    collected: s.collected,
  }))

  return { grand_totals, tehsil_stats, uc_stats, category_stats } satisfies FinanceSummary
}

function getCurrentBillMonth(): string {
  const now = new Date()
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return `${months[now.getMonth()]}${now.getFullYear()}`
}
