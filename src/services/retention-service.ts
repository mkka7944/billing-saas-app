import { createClient } from '@/lib/supabase/server'

export interface RetentionParams {
  baseMonth?: string
  district?: string
}

export async function getPayerRetention(params: RetentionParams = {}) {
  const supabase = await createClient()
  const baseMonth = params.baseMonth || getPreviousMonth(1)
  const m1 = getPreviousMonth(0, baseMonth)
  const m2 = getNextMonth(baseMonth)
  const m3 = getNextMonth(m2)

  let billQuery = supabase
    .from('bills')
    .select('bill_month, payment_status, amount_paid, survey_id')
    .in('bill_month', [baseMonth, m1, m2, m3])

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

  const paidInMonth = (month: string): Set<string> => {
    return new Set(
      (bills || [])
        .filter((b) => b.bill_month === month && b.payment_status?.toLowerCase() === 'paid')
        .map((b) => b.survey_id)
    )
  }

  const m0Payers = paidInMonth(m1)
  const m1Payers = paidInMonth(baseMonth)
  const m2Payers = paidInMonth(m2)
  const m3Payers = paidInMonth(m3)

  const retainedM1 = [...m0Payers].filter((id) => m1Payers.has(id)).length
  const retainedM2 = [...m0Payers].filter((id) => m2Payers.has(id)).length
  const retainedM3 = [...m0Payers].filter((id) => m3Payers.has(id)).length

  const total = m0Payers.size || 1

  const tehsilRetention = await computeTehsilRetention(supabase, bills || [], baseMonth, m1, m2, m3)

  return {
    meta: {
      m0_label: m1,
      m1_label: baseMonth,
      m2_label: m2,
      m3_label: m3,
    },
    grand_totals: {
      m0_payers: m0Payers.size,
      m1_retained: retainedM1,
      m2_retained: retainedM2,
      m3_retained: retainedM3,
      m1_rate: Math.round((retainedM1 / total) * 10000) / 100,
      m2_rate: Math.round((retainedM2 / total) * 10000) / 100,
      m3_rate: Math.round((retainedM3 / total) * 10000) / 100,
    },
    tehsil_retention: tehsilRetention,
  }
}

async function computeTehsilRetention(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bills: Array<{ bill_month: string; payment_status: string | null; survey_id: string }>,
  baseMonth: string,
  m1: string,
  m2: string,
  m3: string,
) {
  const surveyIds = [...new Set(bills.map((b) => b.survey_id).filter(Boolean))]
  const { data: units } = await supabase
    .from('survey_units')
    .select('survey_id, tehsil')
    .in('survey_id', surveyIds)

  const tehsilMap = new Map((units || []).map((u) => [u.survey_id, u.tehsil]))

  const grouped = new Map<string, {
    m0Payers: Set<string>
    m1Payers: Set<string>
    m2Payers: Set<string>
    m3Payers: Set<string>
  }>()

  for (const bill of bills) {
    const tehsil = tehsilMap.get(bill.survey_id) || 'Unknown'
    if (!grouped.has(tehsil)) {
      grouped.set(tehsil, { m0Payers: new Set(), m1Payers: new Set(), m2Payers: new Set(), m3Payers: new Set() })
    }
    const g = grouped.get(tehsil)!
    if (bill.payment_status?.toLowerCase() !== 'paid') continue
    if (bill.bill_month === m1) g.m0Payers.add(bill.survey_id)
    if (bill.bill_month === baseMonth) g.m1Payers.add(bill.survey_id)
    if (bill.bill_month === m2) g.m2Payers.add(bill.survey_id)
    if (bill.bill_month === m3) g.m3Payers.add(bill.survey_id)
  }

  return Array.from(grouped.entries()).map(([tehsil, g]) => {
    const total = g.m0Payers.size || 1
    const r1 = [...g.m0Payers].filter((id) => g.m1Payers.has(id)).length
    const r2 = [...g.m0Payers].filter((id) => g.m2Payers.has(id)).length
    const r3 = [...g.m0Payers].filter((id) => g.m3Payers.has(id)).length
    return {
      tehsil,
      m0_payers: g.m0Payers.size,
      m1_rate: Math.round((r1 / total) * 10000) / 100,
      m2_rate: Math.round((r2 / total) * 10000) / 100,
      m3_rate: Math.round((r3 / total) * 10000) / 100,
    }
  })
}

function getPreviousMonth(count: number, from?: string): string {
  const d = from ? parseMonth(from) : new Date()
  d.setMonth(d.getMonth() - count)
  return formatMonth(d)
}

function getNextMonth(from: string): string {
  const d = parseMonth(from)
  d.setMonth(d.getMonth() + 1)
  return formatMonth(d)
}

function parseMonth(m: string): Date {
  const match = m.match(/^([A-Z]{3})(\d{4})$/)
  if (!match) return new Date()
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const idx = months.indexOf(match[1])
  return new Date(parseInt(match[2]), idx, 1)
}

function formatMonth(d: Date): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return `${months[d.getMonth()]}${d.getFullYear()}`
}

function getCurrentBillMonth(): string {
  const now = new Date()
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return `${months[now.getMonth()]}${now.getFullYear()}`
}
