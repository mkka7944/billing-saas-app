import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PHOTO_COLS = 'id, assignment_item_id, photo_url, gdrive_file_id, gps_lat, gps_lng, captured_at, synced_to_drive'

export async function GET(request: Request) {
  const sup = await createClient()
  const { data: { user } } = await sup.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = new URL(request.url).searchParams
  const psid = sp.get('psid')

  if (!psid) {
    return NextResponse.json({ error: 'psid query param required' }, { status: 400 })
  }

  const { data: items } = await sup
    .from('assignment_items')
    .select('id')
    .eq('psid', psid)

  const itemIds = (items || []).map((i: any) => i.id)
  if (!itemIds.length) {
    return NextResponse.json({ data: [] })
  }

  const { data, error } = await sup
    .from('delivery_photos')
    .select(PHOTO_COLS)
    .in('assignment_item_id', itemIds)
    .order('captured_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data || [] })
}

export async function POST(request: Request) {
  const sup = await createClient()
  const { data: { user } } = await sup.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { assignment_item_id, photo_url, gdrive_file_id, gps_lat, gps_lng } = body as {
    assignment_item_id: string
    photo_url: string
    gdrive_file_id?: string | null
    gps_lat?: number | null
    gps_lng?: number | null
  }

  if (!assignment_item_id || !photo_url) {
    return NextResponse.json({ error: 'assignment_item_id and photo_url required' }, { status: 400 })
  }

  const { data, error } = await sup
    .from('delivery_photos')
    .insert({ assignment_item_id, photo_url, gdrive_file_id, gps_lat, gps_lng, synced_to_drive: true })
    .select(PHOTO_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data }, { status: 201 })
}
