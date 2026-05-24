import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const sup = await createClient()

  // Primary: use RPC (bypasses PostgREST row limit, SELECT DISTINCT)
  const { data, error } = await sup.rpc('get_bill_months')
  if (!error && data) {
    const months = data.map((r: any) => r.bill_month)
    return NextResponse.json({ months })
  }

  // Fallback: direct select if RPC not created yet
  const { data: fb, error: fbErr } = await sup
    .from('bill_items')
    .select('bill_month')
    .order('bill_month', { ascending: false })
    .limit(1000000)

  if (fbErr) return NextResponse.json({ error: fbErr.message }, { status: 500 })

  const months = [...new Set((fb || []).map((r: any) => r.bill_month))]
  return NextResponse.json({ months })
}
