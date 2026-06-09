import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const all = sp.has('all')

    const sup = await createClient()
    const { data: { user } } = await sup.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await sup
      .from('profiles')
      .select('roles!inner(name)')
      .eq('id', user.id)
      .single()

    const role = profile?.roles as { name: string } | undefined
    const isAdmin = role?.name === 'admin' || role?.name === 'super_admin'

    let query = sup
      .from('delivery_photos')
      .select(`
        id,
        assignment_item_id,
        photo_url,
        gdrive_file_id,
        gps_lat,
        gps_lng,
        captured_at,
        synced_to_drive,
        assignment_items!inner(psid)
      `)
      .eq('synced_to_drive', false)
      .is('photo_url', null)
      .order('captured_at', { ascending: false })

    if (all) {
      if (!isAdmin) {
        return NextResponse.json({ error: 'Forbidden: admin required for ?all' }, { status: 403 })
      }
      // Admin requesting all unsynced — no staff filter
    } else {
      // Staff: only their own assignment items — get assignment IDs first
      const { data: myAssignments } = await sup
        .from('daily_assignments')
        .select('id')
        .eq('staff_id', user.id)

      if (!myAssignments?.length) {
        return NextResponse.json({ count: 0, photos: [] })
      }

      const assignmentIds = myAssignments.map(a => a.id)
      const { data: myItems } = await sup
        .from('assignment_items')
        .select('id')
        .in('assignment_id', assignmentIds)

      if (!myItems?.length) {
        return NextResponse.json({ count: 0, photos: [] })
      }

      const itemIds = myItems.map(i => i.id)
      query = query.in('assignment_item_id', itemIds)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const photos = (data || []).map((r: any) => ({
      id: r.id,
      assignment_item_id: r.assignment_item_id,
      psid: r.assignment_items?.psid || '',
      gps_lat: r.gps_lat,
      gps_lng: r.gps_lng,
      captured_at: r.captured_at,
    }))

    return NextResponse.json({ count: photos.length, photos })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
