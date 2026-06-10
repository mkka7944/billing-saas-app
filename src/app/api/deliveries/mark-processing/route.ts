import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { assignmentItemId, psid, gpsLat, gpsLng, targetLat, targetLng } = body as {
      assignmentItemId: string
      psid: string
      gpsLat?: number | null
      gpsLng?: number | null
      targetLat?: number | null
      targetLng?: number | null
    }

    if (!assignmentItemId || !psid) {
      return NextResponse.json({ error: 'assignmentItemId and psid required' }, { status: 400 })
    }

    const gps_lat = gpsLat ?? null
    const gps_lng = gpsLng ?? null

    // Auth
    const sup = await createClient()
    const { data: { user }, error: authError } = await sup.auth.getUser()
    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Role check
    const { data: profile } = await sup
      .from('profiles')
      .select('roles!inner(name)')
      .eq('id', user.id)
      .single()

    const role = profile?.roles as { name: string } | undefined
    if (!role || role.name !== 'field_staff') {
      return NextResponse.json({ error: `Forbidden — role "${role?.name ?? '(none)'}"` }, { status: 403 })
    }

    // Ownership + status check
    const { data: ownership } = await sup
      .from('assignment_items')
      .select('id, status, daily_assignments!inner(staff_id)')
      .eq('id', assignmentItemId)
      .eq('daily_assignments.staff_id', user.id)
      .maybeSingle()

    if (!ownership) {
      return NextResponse.json({ error: 'Forbidden — assignment item does not belong to this user' }, { status: 403 })
    }

    // Always insert a new delivery_photos placeholder (supports multiple photos per month)
    const { data: photoRecord, error: photoErr } = await sup
      .from('delivery_photos')
      .insert({
        assignment_item_id: assignmentItemId,
        photo_url: `pending://unsent/${assignmentItemId}`,
        gdrive_file_id: null,
        gps_lat,
        gps_lng,
        synced_to_drive: false,
      })
      .select('id')
      .single()

    if (photoErr) {
      return NextResponse.json({ error: `Failed to create photo record: ${photoErr.message}` }, { status: 500 })
    }

    // Only set status to processing if still pending (don't downgrade delivered)
    if (ownership.status === 'pending') {
      const { error: updateErr } = await sup
        .from('assignment_items')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          gps_lat,
          gps_lng,
        })
        .eq('id', assignmentItemId)

      if (updateErr) {
        return NextResponse.json({ error: `Failed to update item: ${updateErr.message}` }, { status: 500 })
      }
    }

    return NextResponse.json({
      status: ownership.status === 'pending' ? 'processing' : ownership.status,
      delivery_photo_id: photoRecord.id,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
