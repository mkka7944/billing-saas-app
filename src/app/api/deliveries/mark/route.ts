import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const WEBHOOK_URL = process.env.NEXT_PUBLIC_DRIVE_WEBHOOK_URL

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function stripDataPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(',')
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl
}

function extractFileId(res: Record<string, unknown>): string | null {
  return (
    (res.fileId as string) ||
    (res.id as string) ||
    (res.file_id as string) ||
    ((res.data as Record<string, unknown>)?.id as string) ||
    ((res.data as Record<string, unknown>)?.fileId as string) ||
    null
  )
}

export async function POST(request: Request) {
  const form = await request.formData()
  const photo = form.get('photo') as File | null
  const gpsLatStr = form.get('gps_lat') as string | null
  const gpsLngStr = form.get('gps_lng') as string | null
  const assignmentItemId = form.get('assignment_item_id') as string | null
  const psid = form.get('psid') as string | null
  const targetLatStr = form.get('target_lat') as string | null
  const targetLngStr = form.get('target_lng') as string | null

  if (!photo || !assignmentItemId || !psid) {
    return NextResponse.json({ error: 'photo, assignment_item_id, and psid required' }, { status: 400 })
  }

  const gps_lat = gpsLatStr ? parseFloat(gpsLatStr) : null
  const gps_lng = gpsLngStr ? parseFloat(gpsLngStr) : null
  const target_lat = targetLatStr ? parseFloat(targetLatStr) : null
  const target_lng = targetLngStr ? parseFloat(targetLngStr) : null

  // Auth: verify user is authenticated, is field_staff, and owns this item
  const sup = await createClient()

  const { data: { user }, error: authError } = await sup.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await sup
    .from('profiles')
    .select('roles!inner(name)')
    .eq('id', user.id)
    .single()

  const role = profile?.roles as { name: string } | undefined
  if (!role || role.name !== 'field_staff') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: ownership } = await sup
    .from('assignment_items')
    .select('id, daily_assignments!inner(staff_id)')
    .eq('id', assignmentItemId)
    .eq('daily_assignments.staff_id', user.id)
    .maybeSingle()

  if (!ownership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const email = user.email

  try {
    // 1. Upload photo to GAS webhook
    const buffer = Buffer.from(await photo.arrayBuffer())
    const base64 = buffer.toString('base64')
    const filename = `${psid}_${Date.now()}.webp`

    let gdrive_file_id: string | null = null
    if (WEBHOOK_URL) {
      const ac = new AbortController()
      const timeout = setTimeout(() => ac.abort(), 8000)
      try {
        const webhookRes = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          signal: ac.signal,
          body: JSON.stringify({
            action: 'upload',
            name: filename,
            data: stripDataPrefix(base64),
            surveyId: psid,
            survey_id: psid,
            email: email || 'staff@billing.local',
            timestamp: new Date().toISOString(),
          }),
        })

        if (webhookRes.ok) {
          const result: Record<string, unknown> = await webhookRes.json()
          if (result.status === 'success') {
            gdrive_file_id = extractFileId(result)
          }
        }
      } catch {
        // Timeout or network error — continue without Drive file, queue retries later
      } finally {
        clearTimeout(timeout)
      }
    }

    const photo_url = gdrive_file_id
      ? `https://drive.google.com/thumbnail?id=${gdrive_file_id}&sz=w200`
      : null

    // 2. Save delivery_photos record
    const { error: photoErr } = await sup.from('delivery_photos').insert({
      assignment_item_id: assignmentItemId,
      photo_url,
      gdrive_file_id,
      gps_lat,
      gps_lng,
      synced_to_drive: !!gdrive_file_id,
    })

    if (photoErr) {
      return NextResponse.json({ error: `Failed to save photo: ${photoErr.message}` }, { status: 500 })
    }

    // 3. Read GPS enforcement settings
    let enforceGps = true
    let gpsThreshold = 50
    const { data: setting } = await sup
      .from('app_settings')
      .select('value')
      .eq('key', 'gps_enforcement')
      .maybeSingle()
    if (setting?.value) {
      enforceGps = setting.value.enforce !== false
      gpsThreshold = typeof setting.value.threshold === 'number' ? setting.value.threshold : 50
    }

    // 4. Calculate distance and determine status
    let distance: number | null = null
    let status: 'delivered' | 'processing' = 'processing'

    if (gps_lat != null && gps_lng != null && target_lat != null && target_lng != null) {
      distance = Math.round(haversine(gps_lat, gps_lng, target_lat, target_lng))
      if (!enforceGps || distance <= gpsThreshold) {
        status = 'delivered'
      }
    }

    // 5. Update assignment_items status
    const update: Record<string, unknown> = {
      status,
      delivered_at: new Date().toISOString(),
    }
    if (gps_lat != null) update.gps_lat = gps_lat
    if (gps_lng != null) update.gps_lng = gps_lng

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
      photo_url,
      gdrive_file_id,
      gps_lat,
      gps_lng,
      target_lat,
      target_lng,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
