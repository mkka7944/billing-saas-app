import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentMonth } from '@/lib/constants'

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const district = sp.get('district') || ''
  const tehsil = sp.get('tehsil') || ''
  const month = sp.get('month') || currentMonth()

  const sup = await createClient()

  const { data: raw } = await sup.rpc('get_billing_stats', {
    p_month: month,
    p_district: district,
    p_tehsil: tehsil,
  })

  const r = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!r?.grand_totals) {
    return NextResponse.json({
      grand_totals: { total_units: 0, total_paying: 0, total_collected: 0, total_expected: 0, recovery_rate: 0 },
      tehsil_stats: [], uc_stats: [], category_stats: [],
    })
  }

  const gt = r.grand_totals
  const recoveryRate = gt.total_expected > 0
    ? Math.round((gt.total_collected / gt.total_expected) * 10000) / 100
    : 0

  return NextResponse.json({
    grand_totals: {
      total_units: gt.total_units,
      total_paying: gt.paying_units,
      total_collected: Number(gt.total_collected),
      total_expected: Number(gt.total_expected),
      recovery_rate: recoveryRate,
    },
    tehsil_stats: (r.tehsil_stats || []).map((t: any) => ({
      tehsil: t.name,
      total_units: t.total_units,
      paying_units: t.paying_units,
      expected: Number(t.expected),
      collected: Number(t.collected),
      rate: t.expected > 0 ? Math.round((Number(t.collected) / Number(t.expected)) * 10000) / 100 : 0,
    })),
    uc_stats: (r.uc_stats || []).map((u: any) => ({
      uc_name: u.name,
      tehsil: u.tehsil,
      total_units: u.total_units,
      paying_units: u.paying_units,
      expected: Number(u.expected),
      collected: Number(u.collected),
      rate: u.expected > 0 ? Math.round((Number(u.collected) / Number(u.expected)) * 10000) / 100 : 0,
    })),
    category_stats: (r.category_stats || []).map((c: any) => ({
      category: c.name,
      total_units: c.total_units,
      paying_units: c.paying_units,
      collected: Number(c.collected),
    })),
  })
}
