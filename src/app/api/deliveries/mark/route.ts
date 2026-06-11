import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { haversine } from '@/lib/geo'

const ALLOWED_STATUSES = ['pending', 'processing', 'delivered']

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { assignmentItemId, psid, gpsLat, gpsLng, targetLat, targetLng, skipPhoto } = body as {
      assignmentItemId: string
      psid: string
      gpsLat?: number | null
      gpsLng?: number | null
      targetLat?: number | null
      targetLng?: number | null
      skipPhoto?: boolean
    }

    if (!assignmentItemId || !psid) {
      return NextResponse.json({ error: 'assignmentItemId and psid required' }, { status: 400 })
    }

    const gps_lat = gpsLat ?? null
    const gps_lng = gpsLng ?? null
    const hasPhoto = !skipPhoto

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

    // Ownership check
    const { data: ownership } = await sup
      .from('assignment_items')
      .select('id, status, started_at, daily_assignments!inner(staff_id)')
      .eq('id', assignmentItemId)
      .eq('daily_assignments.staff_id', user.id)
      .maybeSingle()

    if (!ownership) {
      return NextResponse.json({ error: 'Forbidden — assignment item does not belong to this user' }, { status: 403 })
    }

    // Block missed items from being re-delivered
    if (ownership.status === 'missed') {
      return NextResponse.json({ error: 'Item was marked as missed' }, { status: 409 })
    }

    // Only allow allowed statuses to be updated
    if (!ALLOWED_STATUSES.includes(ownership.status)) {
      return NextResponse.json({ error: `Cannot mark item with status "${ownership.status}"` }, { status: 409 })
    }

    // Resolve authoritative target coordinates from survey_units, fall back to client-provided
    let target_lat = targetLat ?? null
    let target_lng = targetLng ?? null
    if (psid) {
      const { data: su } = await sup
        .from('survey_units')
        .select('lat, lng')
        .eq('psid', psid)
        .maybeSingle()
      if (su?.lat != null && su?.lng != null) {
        target_lat = su.lat
        target_lng = su.lng
      }
    }

    // Validate no-photo setting if skipping photo
    if (!hasPhoto) {
      const { data: noPhotoSetting } = await sup
        .from('app_settings')
        .select('value')
        .eq('key', 'allow_no_photo')
        .maybeSingle()

      if (!noPhotoSetting?.value) {
        return NextResponse.json({ error: 'Photo required — no-photo delivery not enabled by admin' }, { status: 400 })
      }
    }

    const startedAt = new Date().toISOString()
    const deliveredAt = startedAt

    // Read GPS enforcement settings
    let enforceGps = true
    let gpsThreshold = 50
    const { data: gpsSetting } = await sup
      .from('app_settings')
      .select('value')
      .eq('key', 'gps_enforcement')
      .maybeSingle()
    if (gpsSetting?.value) {
      enforceGps = gpsSetting.value.enforce !== false
      gpsThreshold = typeof gpsSetting.value.threshold === 'number' ? gpsSetting.value.threshold : 50
    }

    // Calculate distance and determine status
    let distance: number | null = null
    let status: 'delivered' | 'processing' = 'delivered'

    if (ownership.status === 'processing') {
      status = 'delivered'
    } else if (gps_lat != null && gps_lng != null && target_lat != null && target_lng != null) {
      distance = Math.round(haversine(gps_lat, gps_lng, target_lat, target_lng))
      if (enforceGps && distance > gpsThreshold) {
        status = 'processing'
      }
    }

    // Create delivery_photos placeholder if photo expected
    let deliveryPhotoId: string | null = null
    if (hasPhoto) {
      const { data: photoRecord, error: photoErr } = await sup
        .from('delivery_photos')
        .insert({
          assignment_item_id: assignmentItemId,
          photo_url: null,
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
      deliveryPhotoId = photoRecord.id
    }

    // Update assignment_items status
    const update: Record<string, unknown> = {
      status,
      delivered_at: deliveredAt,
    }
    if (!ownership.started_at) update.started_at = startedAt
    update.gps_lat = gps_lat ?? null
    update.gps_lng = gps_lng ?? null

    const { error: updateErr } = await sup
      .from('assignment_items')
      .update(update)
      .eq('id', assignmentItemId)

    if (updateErr) {
      return NextResponse.json({ error: `Failed to update item: ${updateErr.message}` }, { status: 500 })
    }

    return NextResponse.json({
      status,
      distance,
      gps_lat,
      gps_lng,
      delivery_photo_id: deliveryPhotoId,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
