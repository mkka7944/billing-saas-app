import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface OrphanRow {
  psid: string
  bill_month: string
  amount_paid: number
  paid_date: string
  city_district: string
  tehsil: string
  uc_name: string
}

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const month = sp.get('month') || undefined
    const sup = await createClient()

    const { data, error } = await sup.rpc('get_orphan_psids', { p_month: month || null })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const orphans = (data || []) as OrphanRow[]

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
