import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { haversine } from '@/lib/geo'

const ALLOWED_STATUSES = ['pending', 'processing', 'delivered']

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { assignmentItemId, gpsLat, gpsLng, skipPhoto } = body as {
      assignmentItemId: string
      gpsLat?: number | null
      gpsLng?: number | null
      skipPhoto?: boolean
    }

    if (!assignmentItemId) {
      return NextResponse.json({ error: 'assignmentItemId required' }, { status: 400 })
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

    // Ownership + psid lookup
    const { data: ownership } = await sup
      .from('assignment_items')
      .select('id, status, started_at, psid, daily_assignments!inner(staff_id)')
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

    // Derive authoritative target coordinates from survey_units
    let target_lat: number | null = null
    let target_lng: number | null = null
    if (ownership.psid) {
      const { data: su } = await sup
        .from('survey_units')
        .select('lat, lng')
        .eq('psid', ownership.psid)
        .maybeSingle()
      if (su?.lat != null && su?.lng != null) {
        target_lat = su.lat
        target_lng = su.lng
      }
    }

    // Read app settings (allow_no_photo + gps_enforcement) in one query
    const { data: settingsRows } = await sup
      .from('app_settings')
      .select('key, value')
      .in('key', ['allow_no_photo', 'gps_enforcement'])

    const settingsMap: Record<string, any> = {}
    for (const row of settingsRows || []) {
      settingsMap[row.key] = row.value
    }

    // Validate no-photo setting if skipping photo
    if (!hasPhoto && !settingsMap.allow_no_photo) {
      return NextResponse.json({ error: 'Photo required — no-photo delivery not enabled by admin' }, { status: 400 })
    }

    const startedAt = new Date().toISOString()
    const deliveredAt = startedAt

    // Read GPS enforcement settings
    let enforceGps = true
    let gpsThreshold = 50
    const gpsSetting = settingsMap.gps_enforcement
    if (gpsSetting) {
      enforceGps = gpsSetting.enforce !== false
      gpsThreshold = typeof gpsSetting.threshold === 'number' ? gpsSetting.threshold : 50
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
      // Dedup: if a non-superseded photo was created in the last 2s, reuse it (prevents double-tap orphans)
      const twoSecAgo = new Date(Date.now() - 2000).toISOString()
      const { data: recentPhoto } = await sup
        .from('delivery_photos')
        .select('id')
        .eq('assignment_item_id', assignmentItemId)
        .is('superseded_at', null)
        .gte('created_at', twoSecAgo)
        .limit(1)
        .maybeSingle()

      if (recentPhoto) {
        deliveryPhotoId = recentPhoto.id
      } else {
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
