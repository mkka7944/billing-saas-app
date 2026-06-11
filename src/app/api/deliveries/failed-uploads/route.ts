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

    // Step 1: Get the assignment_item_ids this user can see
    let allowedItemIds: string[] | null = null // null = admin can see all

    if (staffId && isAdmin) {
      const { data: staffAssignments } = await sup
        .from('daily_assignments')
        .select('id')
        .eq('staff_id', staffId)
      if (!staffAssignments?.length) return NextResponse.json({ count: 0, photos: [] })

      const { data: staffItems } = await sup
        .from('assignment_items')
        .select('id')
        .in('assignment_id', staffAssignments.map(a => a.id))
      if (!staffItems?.length) return NextResponse.json({ count: 0, photos: [] })

      allowedItemIds = staffItems.map(i => i.id)
    } else if (!isAdmin) {
      // Staff: only their own assignment items
      const { data: myAssignments } = await sup
        .from('daily_assignments')
        .select('id')
        .eq('staff_id', user.id)
      if (!myAssignments?.length) return NextResponse.json({ count: 0, photos: [] })

      const { data: myItems } = await sup
        .from('assignment_items')
        .select('id')
        .in('assignment_id', myAssignments.map(a => a.id))
      if (!myItems?.length) return NextResponse.json({ count: 0, photos: [] })

      allowedItemIds = myItems.map(i => i.id)
    }

    // Step 2: Fetch delivery_photos with assignment_items (single-level join)
    let photoQuery = sup
      .from('delivery_photos')
      .select(`
        id,
        assignment_item_id,
        gps_lat,
        gps_lng,
        captured_at,
        verified_by,
        assignment_items!inner(psid, status, assignment_id)
      `)
      .eq('synced_to_drive', false)
      .is('verified_by', null)
      .order('captured_at', { ascending: false })

    if (allowedItemIds) {
      photoQuery = photoQuery.in('assignment_item_id', allowedItemIds)
    }

    const { data, error } = await photoQuery

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data?.length) {
      return NextResponse.json({ count: 0, photos: [], staffList: [] })
    }

    // Step 3: Fetch staff names for the assignment IDs (separate query)
    const assignmentIds = [...new Set(data.map((r: any) => r.assignment_items?.assignment_id).filter(Boolean))]
    const staffMap = new Map<string, string>()
    let dailyAssignments: { id: string; staff_id: string }[] = []
    let staffLookupRows: { id: string; full_name: string | null; username: string | null }[] = []

    if (assignmentIds.length > 0) {
      const { data: da } = await sup
        .from('daily_assignments')
        .select('id, staff_id')
        .in('id', assignmentIds)

      if (da?.length) {
        dailyAssignments = da
        const uniqueStaffIds = [...new Set(da.map(a => a.staff_id))]
        const { data: sr } = await sup
          .from('staff')
          .select('id, full_name, username')
          .in('id', uniqueStaffIds)
        staffLookupRows = sr || []

        const nameMap = new Map((sr || []).map(s => [s.id, s.full_name || s.username || 'Unknown']))
        for (const a of da) {
          staffMap.set(a.id, nameMap.get(a.staff_id) || 'Unknown')
        }
      }
    }

    // Step 4: Build response
    const photos = (data || []).map((r: any) => {
      const ai = r.assignment_items || {}
      return {
        id: r.id,
        assignment_item_id: r.assignment_item_id,
        psid: ai.psid || '',
        status: ai.status || '',
        staff_name: staffMap.get(ai.assignment_id) || 'Unknown',
        staff_id: null,
        gps_lat: r.gps_lat,
        gps_lng: r.gps_lng,
        captured_at: r.captured_at,
      }
    })

    // Staff list for admin filter dropdown
    const staffIds = [...new Set(dailyAssignments.map(a => a.staff_id).filter(Boolean))]
    const staffList = staffLookupRows.map(s => ({
      id: s.id,
      name: s.full_name || s.username || 'Unknown',
    }))

    return NextResponse.json({ count: photos.length, photos, staffList })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
