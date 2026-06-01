import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const month = sp.get('month') || ''
    const sup = await createClient()

    const { data: matched, error: matchErr } = await sup
      .from('survey_units')
      .select('psid')
      .not('psid', 'is', null)

    if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 })

    const psidSet = new Set((matched || []).map(r => r.psid))

    let query = sup
      .from('payment_history')
      .select('psid, bill_month, amount_paid, paid_date, city_district, tehsil, uc_name')
      .eq('payment_status', 'paid')
      .order('bill_month', { ascending: false })
      .order('paid_date', { ascending: false })

    if (month) query = query.eq('bill_month', month)

    const { data: allPaid, error: paidErr } = await query

    if (paidErr) return NextResponse.json({ error: paidErr.message }, { status: 500 })

    const orphans = (allPaid || []).filter(r => !psidSet.has(r.psid))

    const monthTotals = orphans.reduce<Record<string, { psids: number; amount: number }>>((acc, row) => {
      const m = row.bill_month
      if (!acc[m]) acc[m] = { psids: 0, amount: 0 }
      acc[m].psids++
      acc[m].amount += (row.amount_paid || 0)
      return acc
    }, {})

    return NextResponse.json({
      rows: orphans,
      total: orphans.length,
      month_totals: Object.entries(monthTotals).map(([bill_month, stats]) => ({ bill_month, ...stats })),
    })
  } catch (err) {
    console.error('orphan-psids route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
