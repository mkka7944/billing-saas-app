import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripDataPrefix, extractFileId } from '@/lib/drive'

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
      .select('id, assignment_item_id, synced_to_drive, assignment_items!inner(daily_assignments!inner(staff_id))')
      .eq('id', deliveryPhotoId)
      .eq('assignment_items.daily_assignments.staff_id', user.id)
      .single()

    if (fetchErr || !photoRecord) {
      return NextResponse.json({ error: 'Delivery photo record not found or does not belong to you' }, { status: 404 })
    }

    if (photoRecord.synced_to_drive) {
      return NextResponse.json({ success: true, already_synced: true })
    }

    // Look up the assignment item for survey_id / email context
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
        }
      }
    } catch {
      // GAS failed — will retry from queue
    } finally {
      clearTimeout(timeout)
    }

    if (!gdrive_file_id) {
      return NextResponse.json({ error: 'Failed to upload to Drive' }, { status: 502 })
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

    return NextResponse.json({ success: true, photo_url, gdrive_file_id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
