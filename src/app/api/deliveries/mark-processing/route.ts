import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { assignmentItemId, psid, gpsLat, gpsLng } = await request.json()

  if (!assignmentItemId || !psid) {
    return NextResponse.json({ error: 'assignmentItemId and psid required' }, { status: 400 })
  }

  const sup = await createClient()

  const { data: { user }, error: authError } = await sup.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: ownership } = await sup
    .from('assignment_items')
    .select('id, status, daily_assignments!inner(staff_id)')
    .eq('id', assignmentItemId)
    .eq('daily_assignments.staff_id', user.id)
    .maybeSingle()

  if (!ownership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (ownership.status === 'delivered' || ownership.status === 'missed') {
    return NextResponse.json({ status: ownership.status, already_delivered: true })
  }

  const { error: photoErr } = await sup.from('delivery_photos').insert({
    assignment_item_id: assignmentItemId,
    photo_url: `pending://unsent/${assignmentItemId}`,
    gps_lat: gpsLat ?? null,
    gps_lng: gpsLng ?? null,
    synced_to_drive: false,
  })

  if (photoErr) {
    return NextResponse.json({ error: `Failed to create photo record: ${photoErr.message}` }, { status: 500 })
  }

  const update: Record<string, unknown> = {
    status: 'processing',
    delivered_at: new Date().toISOString(),
  }
  if (gpsLat != null) update.gps_lat = gpsLat
  if (gpsLng != null) update.gps_lng = gpsLng

  const { error: updateErr } = await sup
    .from('assignment_items')
    .update(update)
    .eq('id', assignmentItemId)

  if (updateErr) {
    return NextResponse.json({ error: `Failed to update item: ${updateErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ status: 'processing' })
}
