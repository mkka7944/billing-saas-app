import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const staffId = sp.get('staff_id')

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
        gps_lat,
        gps_lng,
        captured_at,
        verified_by,
        assignment_items!inner(
          psid,
          status,
          daily_assignments!inner(
            staff_id,
            staff!inner(full_name, username)
          )
        )
      `)
      .eq('synced_to_drive', false)
      .is('verified_by', null)
      .order('captured_at', { ascending: false })

    if (staffId && isAdmin) {
      const { data: staffAssignments } = await sup
        .from('daily_assignments')
        .select('id')
        .eq('staff_id', staffId)

      if (staffAssignments?.length) {
        const assignmentIds = staffAssignments.map(a => a.id)
        const { data: staffItems } = await sup
          .from('assignment_items')
          .select('id')
          .in('assignment_id', assignmentIds)
        if (staffItems?.length) {
          const itemIds = staffItems.map(i => i.id)
          query = query.in('assignment_item_id', itemIds)
        } else {
          return NextResponse.json({ count: 0, photos: [] })
        }
      } else {
        return NextResponse.json({ count: 0, photos: [] })
      }
    } else if (!isAdmin) {
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

    const photos = (data || []).map((r: any) => {
      const ai = r.assignment_items || {}
      const da = ai.daily_assignments || {}
      const s = da.staff || {}
      return {
        id: r.id,
        assignment_item_id: r.assignment_item_id,
        psid: ai.psid || '',
        status: ai.status || '',
        staff_name: s.full_name || s.username || 'Unknown',
        staff_id: da.staff_id || null,
        gps_lat: r.gps_lat,
        gps_lng: r.gps_lng,
        captured_at: r.captured_at,
      }
    })

    // If admin, also fetch staff list for filter dropdown
    let staffList: { id: string; name: string }[] = []
    if (isAdmin && photos.length > 0) {
      const uniqueStaffIds = [...new Set(photos.map(p => p.staff_id).filter(Boolean))]
      if (uniqueStaffIds.length > 0) {
        const { data: staffRows } = await sup
          .from('staff')
          .select('id, full_name, username')
          .in('id', uniqueStaffIds)
        staffList = (staffRows || []).map(s => ({
          id: s.id,
          name: s.full_name || s.username || 'Unknown',
        }))
      }
    }

    return NextResponse.json({ count: photos.length, photos, staffList })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
