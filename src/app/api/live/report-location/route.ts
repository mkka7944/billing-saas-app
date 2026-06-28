import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const sup = await createClient()

  const { data: { session }, error: authError } = await sup.auth.getSession()
  if (!session?.user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = session.user

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
  const locations = body.locations || [body]

  if (!locations.length) {
    return NextResponse.json({ error: 'No locations provided' }, { status: 400 })
  }

  // Rate limit: check last report against the batch's latest timestamp
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

  // Batch insert
  const rows = locations.map((loc: any) => {
    if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
      throw new Error('lat and lng are required')
    }
    return {
      staff_id: staff.id,
      lat: loc.lat,
      lng: loc.lng,
      accuracy: typeof loc.accuracy === 'number' ? loc.accuracy : null,
      source: 'gps',
    }
  })

  const { error: insertError } = await sup
    .from('staff_locations')
    .insert(rows)

  if (insertError) {
    console.error('report-location insert error:', insertError)
    return NextResponse.json({ error: 'Failed to save locations' }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok', count: rows.length })
}
