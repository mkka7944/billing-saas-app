import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const sup = await createClient()

  const { data: { user }, error: authError } = await sup.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify staff exists
  const { data: staff } = await sup
    .from('staff')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!staff) {
    return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
  }

  const body = await request.json()
  const { lat, lng, accuracy } = body

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 })
  }

  // Rate limit: check last report
  const { data: lastReport } = await sup
    .from('staff_locations')
    .select('captured_at')
    .eq('staff_id', staff.id)
    .order('captured_at', { ascending: false })
    .limit(1)
    .single()

  if (lastReport) {
    const elapsed = Date.now() - new Date(lastReport.captured_at).getTime()
    if (elapsed < 30000) {
      return NextResponse.json({ error: 'Rate limited — 30s minimum between reports' }, { status: 429 })
    }
  }

  const { error: insertError } = await sup
    .from('staff_locations')
    .insert({
      staff_id: staff.id,
      lat,
      lng,
      accuracy: typeof accuracy === 'number' ? accuracy : null,
      source: 'gps',
    })

  if (insertError) {
    console.error('report-location insert error:', insertError)
    return NextResponse.json({ error: 'Failed to save location' }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok' })
}
