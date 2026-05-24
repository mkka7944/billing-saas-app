import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const sup = await createClient()
  const { data, error } = await sup
    .from('bill_months')
    .select('month')
    .order('month', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const months = (data || []).map((r: any) => r.month)
  return NextResponse.json({ months })
}
