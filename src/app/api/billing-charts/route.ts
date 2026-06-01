import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentMonth } from '@/lib/constants'
import type { BillingChartsData, MonthlyCurveRow } from '@/types'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_INDEX: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 }

function formatCycleDate(billMonth: string, day: number): string {
  const mon = billMonth.slice(0, 3).toUpperCase()
  const yr = parseInt(billMonth.slice(3))
  const d = new Date(yr, MONTH_INDEX[mon] ?? 0, 16)
  d.setDate(d.getDate() + day - 1)
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
}

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const district = sp.get('district') || ''
  const tehsil = sp.get('tehsil') || ''
  const month = sp.get('month') || currentMonth()

  const sup = createAdminClient()
  const { data, error } = await sup.rpc('get_charts_data', {
    p_district: district,
    p_tehsil: tehsil,
    p_month: month,
  } as any)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Second call without district/tehsil filter — only for tehsil_breakdown (all cities)
  const { data: allData } = await sup.rpc('get_charts_data', {
    p_district: '',
    p_tehsil: '',
    p_month: month,
  } as any)

  const raw = (data || {}) as any
  const rawAll = (allData || {}) as any
  const curves: MonthlyCurveRow[] = (raw.monthly_curves || []).map((r: any) => ({
    bill_month: r.bill_month,
    day: r.day,
    daily_amount: r.daily_amount,
    cumulative_amount: r.cumulative_amount,
    day_label: formatCycleDate(r.bill_month, r.day),
  }))

  const result: BillingChartsData = {
    monthly_trend: raw.monthly_trend || [],
    daily_detail: raw.daily_detail || [],
    category_summary: raw.category_summary || [],
    tehsil_breakdown: rawAll.tehsil_breakdown || raw.tehsil_breakdown || [],
    monthly_curves: curves,
    kpi: raw.kpi || { total_units: 0, collected: 0 },
  }

  return NextResponse.json(result)
}
