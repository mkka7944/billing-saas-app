import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripDataPrefix, extractFileId } from '@/lib/drive'
import { haversine } from '@/lib/geo'

const WEBHOOK_URL = process.env.NEXT_PUBLIC_DRIVE_WEBHOOK_URL

export async function POST(request: Request) {
  try {
    if (!WEBHOOK_URL) {
      return NextResponse.json({ error: 'Drive webhook not configured' }, { status: 500 })
    }

    const body = await request.json()
    const { deliveryPhotoId, dataUrl } = body as {
      deliveryPhotoId: string
      dataUrl: string
    }

    if (!deliveryPhotoId || !dataUrl) {
      return NextResponse.json({ error: 'deliveryPhotoId and dataUrl required' }, { status: 400 })
    }

    const sup = await createClient()
    const { data: { user } } = await sup.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify the record exists and is not already synced — with ownership check
    const { data: photoRecord, error: fetchErr } = await sup
      .from('delivery_photos')
      .select('id, assignment_item_id, synced_to_drive, gps_lat, gps_lng, assignment_items!inner(daily_assignments!inner(staff_id))')
      .eq('id', deliveryPhotoId)
      .eq('assignment_items.daily_assignments.staff_id', user.id)
      .single()

    if (fetchErr || !photoRecord) {
      return NextResponse.json({ error: 'Delivery photo record not found or does not belong to you' }, { status: 404 })
    }

    if (photoRecord.synced_to_drive) {
      // Already synced — just promote if not already delivered
      const { data: item } = await sup
        .from('assignment_items')
        .select('status')
        .eq('id', photoRecord.assignment_item_id)
        .single()

      if (item && item.status !== 'delivered') {
        await sup.from('assignment_items').update({ status: 'delivered' }).eq('id', photoRecord.assignment_item_id)
      }

      return NextResponse.json({ success: true, already_synced: true })
    }

    // Look up the assignment item for psid / email context
    const { data: item } = await sup
      .from('assignment_items')
      .select('psid, daily_assignments!inner(staff_id, staff:staff_id(email))')
      .eq('id', photoRecord.assignment_item_id)
      .single()

    const psid = item?.psid || ''
    const email = (item as any)?.daily_assignments?.staff?.email
    const fileKey = psid
    const filename = `${fileKey}_${Date.now()}.webp`

    // Upload to GAS webhook
    const rawBase64 = stripDataPrefix(dataUrl)
    const ac = new AbortController()
    const timeout = setTimeout(() => ac.abort(), 8000)

    let gdrive_file_id: string | null = null
    let gasError: string | null = null
    try {
      const webhookRes = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        signal: ac.signal,
        body: JSON.stringify({
          action: 'upload',
          name: filename,
          data: rawBase64,
          surveyId: fileKey,
          survey_id: fileKey,
          email,
          timestamp: new Date().toISOString(),
        }),
      })

      if (webhookRes.ok) {
        const result: Record<string, unknown> = await webhookRes.json()
        if (result.status === 'success') {
          gdrive_file_id = extractFileId(result)
        } else {
          gasError = `GAS returned status="${result.status}": ${JSON.stringify(result).slice(0, 200)}`
        }
      } else {
        const bodyText = await webhookRes.text().catch(() => '(unreadable)')
        gasError = `GAS HTTP ${webhookRes.status}: ${bodyText.slice(0, 200)}`
      }
    } catch (err) {
      gasError = `GAS fetch error: ${err instanceof Error ? err.message : String(err)}`
    } finally {
      clearTimeout(timeout)
    }

    if (!gdrive_file_id) {
      try { await sup.from('app_error_log').insert({
        level: 'error',
        user_id: user.id,
        message: `Photo upload failed for PSID ${psid}: ${gasError || 'unknown'}`,
        details: { psid, deliveryPhotoId, gasError },
        source: 'promote',
      }) } catch (_e) { /* log table insert failure — don't block the main response */ }
      return NextResponse.json({ error: `Failed to upload to Drive — ${gasError || 'unknown'}` }, { status: 502 })
    }

    const photo_url = `/api/delivery/photo/${gdrive_file_id}`

    // Update the delivery_photos record
    const { error: updateErr } = await sup
      .from('delivery_photos')
      .update({
        photo_url,
        gdrive_file_id,
        synced_to_drive: true,
      })
      .eq('id', deliveryPhotoId)

    if (updateErr) {
      return NextResponse.json({ error: `Failed to update photo record: ${updateErr.message}` }, { status: 500 })
    }

    // Evaluate GPS and promote status
    const gps_lat = photoRecord.gps_lat
    const gps_lng = photoRecord.gps_lng

    // Resolve target coordinates from survey_units
    let target_lat: number | null = null
    let target_lng: number | null = null
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

    let finalStatus = 'delivered'
    let distance: number | null = null
    if (gps_lat != null && gps_lng != null && target_lat != null && target_lng != null) {
      distance = Math.round(haversine(gps_lat, gps_lng, target_lat, target_lng))
      if (enforceGps && distance > gpsThreshold) {
        finalStatus = 'processing'
      }
    }

    const { error: promoteErr } = await sup
      .from('assignment_items')
      .update({
        status: finalStatus,
        delivered_at: finalStatus === 'delivered' ? new Date().toISOString() : null,
      })
      .eq('id', photoRecord.assignment_item_id)

    if (promoteErr) {
      return NextResponse.json({ error: `Failed to promote status: ${promoteErr.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      photo_url,
      gdrive_file_id,
      status: finalStatus,
      distance,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
