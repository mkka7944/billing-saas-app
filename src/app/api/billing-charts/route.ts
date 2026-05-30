import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentMonth } from '@/lib/constants'
import type { BillingChartsData, MonthlyCurveRow } from '@/types'

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

  const raw = (data || {}) as any
  const curves: MonthlyCurveRow[] = (raw.monthly_curves || []).map((r: any) => ({
    bill_month: r.bill_month,
    day: r.day,
    daily_amount: r.daily_amount,
    cumulative_amount: r.cumulative_amount,
    day_label: r.paid_date ? new Date(r.paid_date + 'T00:00:00').getDate() : r.day,
  }))

  const result: BillingChartsData = {
    monthly_trend: raw.monthly_trend || [],
    daily_detail: raw.daily_detail || [],
    category_summary: raw.category_summary || [],
    tehsil_breakdown: raw.tehsil_breakdown || [],
    monthly_curves: curves,
    kpi: raw.kpi || { total_units: 0, collected: 0 },
  }

  return NextResponse.json(result)
}
