import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ITEM_COLS = 'id, assignment_id, psid, route_seq, status, delivered_at, gps_lat, gps_lng, notes'

export async function PATCH(request: Request) {
  const body = await request.json()
  const { id, status, gps_lat, gps_lng, notes } = body as {
    id: string
    status: 'delivered' | 'missed' | 'skipped'
    gps_lat?: number | null
    gps_lng?: number | null
    notes?: string | null
  }

  if (!id || !status) {
    return NextResponse.json({ error: 'id and status required' }, { status: 400 })
  }

  if (!['delivered', 'missed', 'skipped'].includes(status)) {
    return NextResponse.json({ error: 'status must be delivered, missed, or skipped' }, { status: 400 })
  }

  const sup = await createClient()

  const update: Record<string, unknown> = {
    status,
    delivered_at: new Date().toISOString(),
  }
  if (gps_lat != null) update.gps_lat = gps_lat
  if (gps_lng != null) update.gps_lng = gps_lng
  if (notes != null) update.notes = notes

  const { data, error } = await sup
    .from('assignment_items')
    .update(update)
    .eq('id', id)
    .select(ITEM_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  return NextResponse.json({ data })
}
