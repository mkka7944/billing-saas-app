import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentMonth } from '@/lib/constants'

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const month = sp.get('month') || currentMonth()

    const sup = createAdminClient()
    const { data, error } = await sup.rpc('get_delivery_quality', {
      p_month: month,
    } as any)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (data || []) as Array<{
      staff_id: string
      staff_name: string
      assigned_city: string
      total_assigned: number
      total_delivered: number
      photo_fail_count: number
      gps_oor_count: number
      fail_rate: number
      quality_score: number
    }>

    return NextResponse.json({ month, rows })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
