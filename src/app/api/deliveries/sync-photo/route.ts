import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const WEBHOOK_URL = process.env.NEXT_PUBLIC_DRIVE_WEBHOOK_URL

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
  const sup = await createClient()
  const { data: { user } } = await sup.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { assignmentItemId, psid, dataUrl, gpsLat, gpsLng, survey_id } = body

  if (!assignmentItemId || !psid || !dataUrl) {
    return NextResponse.json({ error: 'assignmentItemId, psid, and dataUrl required' }, { status: 400 })
  }

  const { data: ownership } = await sup
    .from('assignment_items')
    .select('id, status, daily_assignments!inner(staff_id)')
    .eq('id', assignmentItemId)
    .single()

  if (!ownership) {
    return NextResponse.json({ error: 'Assignment item not found' }, { status: 404 })
  }

  if (ownership.status !== 'processing') {
    return NextResponse.json({ error: 'Item is not in processing state' }, { status: 409 })
  }

  if (!WEBHOOK_URL) {
    return NextResponse.json({ error: 'Webhook URL not configured' }, { status: 500 })
  }

  try {
    const rawBase64 = stripDataPrefix(dataUrl)
    const fileKey = survey_id || psid
    const filename = `${fileKey}_${Date.now()}.webp`

    const ac = new AbortController()
    const timeout = setTimeout(() => ac.abort(), 8000)

    let gdrive_file_id: string | null = null
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
          email: user.email || 'staff@billing.local',
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
      // GAS failed — will retry later
    } finally {
      clearTimeout(timeout)
    }

    if (!gdrive_file_id) {
      return NextResponse.json({ error: 'Failed to upload to Drive' }, { status: 502 })
    }

    const photo_url = `/api/delivery/photo/${gdrive_file_id}`

    const { error: updateErr } = await sup
      .from('delivery_photos')
      .update({
        photo_url,
        gdrive_file_id,
        synced_to_drive: true,
        gps_lat: gpsLat ?? null,
        gps_lng: gpsLng ?? null,
      })
      .eq('assignment_item_id', assignmentItemId)

    if (updateErr) {
      return NextResponse.json({ error: `Failed to update photo: ${updateErr.message}` }, { status: 500 })
    }

    const { error: promoteErr } = await sup
      .from('assignment_items')
      .update({ status: 'delivered' })
      .eq('id', assignmentItemId)

    if (promoteErr) {
      return NextResponse.json({ error: `Photo saved but failed to promote: ${promoteErr.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, photo_url, gdrive_file_id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
