import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { assignmentItemId, photoUrl, gdriveFileId, gpsLat, gpsLng } = await request.json()

  if (!assignmentItemId || !photoUrl) {
    return NextResponse.json({ error: 'assignmentItemId and photoUrl required' }, { status: 400 })
  }

  const sup = await createClient()

  const { data: { user }, error: authError } = await sup.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: ownership } = await sup
    .from('assignment_items')
    .select('id, status')
    .eq('id', assignmentItemId)
    .eq('daily_assignments.staff_id', user.id)
    .maybeSingle()

  if (!ownership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: existingPhotos } = await sup
    .from('delivery_photos')
    .select('id')
    .eq('assignment_item_id', assignmentItemId)
    .eq('synced_to_drive', false)
    .limit(1)

  if (!existingPhotos?.length) {
    const { error: insertErr } = await sup.from('delivery_photos').insert({
      assignment_item_id: assignmentItemId,
      photo_url: photoUrl,
      gdrive_file_id: gdriveFileId ?? null,
      gps_lat: gpsLat ?? null,
      gps_lng: gpsLng ?? null,
      synced_to_drive: true,
    })
    if (insertErr) {
      return NextResponse.json({ error: `Failed to insert photo: ${insertErr.message}` }, { status: 500 })
    }
  } else {
    const { error: updateErr } = await sup
      .from('delivery_photos')
      .update({
        photo_url: photoUrl,
        gdrive_file_id: gdriveFileId ?? null,
        gps_lat: gpsLat ?? null,
        gps_lng: gpsLng ?? null,
        synced_to_drive: true,
      })
      .eq('id', existingPhotos[0].id)

    if (updateErr) {
      return NextResponse.json({ error: `Failed to update photo: ${updateErr.message}` }, { status: 500 })
    }
  }

  const { error: promoteErr } = await sup
    .from('assignment_items')
    .update({ status: 'delivered' })
    .eq('id', assignmentItemId)
    .eq('status', 'processing')

  if (promoteErr) {
    return NextResponse.json({ error: `Failed to promote status: ${promoteErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ status: 'delivered', promoted: true })
}
