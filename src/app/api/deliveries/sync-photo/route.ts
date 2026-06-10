import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { deliveryPhotoId, gdriveFileId } = body as {
      deliveryPhotoId: string
      gdriveFileId: string
    }

    if (!deliveryPhotoId || !gdriveFileId) {
      return NextResponse.json({ error: 'deliveryPhotoId and gdriveFileId required' }, { status: 400 })
    }

    const sup = await createClient()
    const { data: { user } } = await sup.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    const photo_url = `/api/delivery/photo/${gdriveFileId}`

    const { error: updateErr } = await sup
      .from('delivery_photos')
      .update({
        photo_url,
        gdrive_file_id: gdriveFileId,
        synced_to_drive: true,
      })
      .eq('id', deliveryPhotoId)

    if (updateErr) {
      return NextResponse.json({ error: `Failed to update photo record: ${updateErr.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, photo_url, gdrive_file_id: gdriveFileId })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
