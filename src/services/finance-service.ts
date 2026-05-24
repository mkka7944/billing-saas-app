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

  let itemsQuery = supabase
    .from('bill_items')
    .select('psid, survey_id, amount_due')
    .eq('bill_month', month)

  if (params.district) {
    const { data: surveyIds } = await supabase
      .from('survey_units')
      .select('survey_id')
      .eq('city_district', params.district)
      .eq('status', 'ACTIVE')
    const ids = (surveyIds || []).map((s) => s.survey_id)
    if (ids.length) itemsQuery = itemsQuery.in('survey_id', ids)
  }

  if (params.tehsil) {
    const { data: surveyIds } = await supabase
      .from('survey_units')
      .select('survey_id')
      .eq('tehsil', params.tehsil)
      .eq('status', 'ACTIVE')
    const ids = (surveyIds || []).map((s) => s.survey_id)
    if (ids.length) itemsQuery = itemsQuery.in('survey_id', ids)
  }

  const { data: items, error } = await itemsQuery
  if (error) throw error

  const psids = (items || []).map((i) => i.psid)
  let paidRows: { psid: string; amount_paid: number | null }[] = []
  if (psids.length) {
    const { data: p } = await supabase
      .from('payment_history')
      .select('psid, amount_paid')
      .eq('bill_month', month)
      .eq('payment_status', 'paid')
      .in('psid', psids)
    paidRows = p || []
  }

  const paidPsids = new Set(paidRows.map((p) => p.psid))
  const totalCollected = paidRows.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0)
  const totalExpected = items?.reduce((sum, i) => sum + Number(i.amount_due || 0), 0) || 0

  const grand_totals = {
    total_units: items?.length || 0,
    total_paying: paidPsids.size,
    total_collected: totalCollected,
    total_expected: totalExpected,
    recovery_rate: totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 10000) / 100 : 0,
  }

  const { data: allUnits } = await supabase
    .from('survey_units')
    .select('survey_id, tehsil')
    .eq('status', 'ACTIVE')
    .in('survey_id', items?.map((i) => i.survey_id) || [])

  const unitTehsilMap = new Map((allUnits || []).map((u) => [u.survey_id, u.tehsil]))

  const tehsilMap = new Map<string, { total: number; paid: number; collected: number; expected: number }>()
  for (const item of items || []) {
    const t = unitTehsilMap.get(item.survey_id) || 'Unknown'
    const entry = tehsilMap.get(t) || { total: 0, paid: 0, collected: 0, expected: 0 }
    entry.total++
    if (paidPsids.has(item.psid)) {
      entry.paid++
      const paidRow = paidRows.find((p) => p.psid === item.psid)
      entry.collected += Number(paidRow?.amount_paid || 0)
    }
    entry.expected += Number(item.amount_due || 0)
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
  for (const item of items || []) {
    const { data: unit } = await supabase
      .from('survey_units')
      .select('uc_name, tehsil')
      .eq('survey_id', item.survey_id)
      .single()
    if (!unit) continue
    const key = unit.uc_name || 'Unknown'
    const entry = ucStatsMap.get(key) || { tehsil: unit.tehsil || 'Unknown', total: 0, paid: 0, collected: 0, expected: 0 }
    entry.total++
    if (paidPsids.has(item.psid)) {
      entry.paid++
      const paidRow = paidRows.find((p) => p.psid === item.psid)
      entry.collected += Number(paidRow?.amount_paid || 0)
    }
    entry.expected += Number(item.amount_due || 0)
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
  for (const item of items || []) {
    const { data: unit } = await supabase
      .from('survey_units')
      .select('billing_category')
      .eq('survey_id', item.survey_id)
      .single()
    if (!unit) continue
    const cat = unit.billing_category || 'Unknown'
    const entry = catMap.get(cat) || { total: 0, paid: 0, collected: 0 }
    entry.total++
    if (paidPsids.has(item.psid)) {
      entry.paid++
      const paidRow = paidRows.find((p) => p.psid === item.psid)
      entry.collected += Number(paidRow?.amount_paid || 0)
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
