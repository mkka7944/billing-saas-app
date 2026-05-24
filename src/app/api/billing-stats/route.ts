import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function currentMonth(): string {
  const m = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const d = new Date()
  return `${m[d.getMonth()]}${d.getFullYear()}`
}

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const district = sp.get('district') || null
  const tehsil = sp.get('tehsil') || null
  const month = sp.get('month') || currentMonth()

  const sup = await createClient()
  const { data, error } = await sup.rpc('get_billing_summary', {
    p_city_district: district,
    p_tehsil: tehsil,
    p_bill_month: month,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const row = data?.[0] || { total_units: 0, total_paying: 0, total_collected: 0, total_expected: 0, recovery_rate: 0 }

  return NextResponse.json({
    grand_totals: {
      total_units: row.total_units,
      total_paying: row.total_paying,
      total_collected: row.total_collected,
      total_expected: row.total_expected,
      recovery_rate: row.recovery_rate,
    },
    tehsil_stats: [],
    uc_stats: [],
    category_stats: [],
  })
}
