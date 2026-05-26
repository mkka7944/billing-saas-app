import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const sup = await createClient()

  // Try reference table first (fast, under 1000 rows)
  const { data, error } = await sup
    .from('bill_months')
    .select('month')
    .order('month', { ascending: false })

  if (!error && data?.length) {
    return NextResponse.json({ months: data.map((r: any) => r.month) })
  }

  // Fallback: payment_history has the most complete set of months
  const { data: ph, error: phError } = await sup
    .from('payment_history')
    .select('bill_month')
    .order('bill_month', { ascending: false })
    .range(0, 1_000_000)

  if (phError) return NextResponse.json({ error: phError.message }, { status: 500 })

  const months = [...new Set((ph || []).map((r: any) => r.bill_month))]
  return NextResponse.json({ months })
}
