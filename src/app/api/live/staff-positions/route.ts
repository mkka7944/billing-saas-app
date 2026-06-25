import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ACTIVE_THRESHOLD_MS = 3 * 60 * 1000 // 3 minutes

export async function GET(request: Request) {
  const sup = await createClient()

  const { data: { user }, error: authError } = await sup.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = new URL(request.url).searchParams
  const city = sp.get('city') || ''
  if (!city) {
    return NextResponse.json({ error: 'city is required' }, { status: 400 })
  }

  // 1. Get all staff in this city
  const { data: staffList } = await sup
    .from('staff')
    .select('id, full_name, assigned_city')
    .eq('assigned_city', city)

  if (!staffList?.length) {
    return NextResponse.json({ positions: [] })
  }

  const staffIds = staffList.map((s: any) => s.id)
  const staffNameMap = new Map(staffList.map((s: any) => [s.id, s.full_name]))

  // 2. Get locations from the last hour (stale beyond that)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: locations } = await sup
    .from('staff_locations')
    .select('staff_id, lat, lng, accuracy, captured_at, source')
    .in('staff_id', staffIds)
    .gte('captured_at', oneHourAgo)
    .order('captured_at', { ascending: false })

  // 3. Deduplicate — keep latest location per staff
  const latestByStaff = new Map<string, any>()
  for (const loc of locations || []) {
    if (!latestByStaff.has(loc.staff_id)) {
      latestByStaff.set(loc.staff_id, loc)
    }
  }

  // 4. Build response
  const now = Date.now()
  const positions = Array.from(latestByStaff.entries()).map(([staffId, loc]) => {
    const lastSeen = new Date(loc.captured_at).getTime()
    return {
      staff_id: staffId,
      staff_name: staffNameMap.get(staffId) || 'Unknown',
      lat: loc.lat,
      lng: loc.lng,
      accuracy: loc.accuracy,
      last_seen: loc.captured_at,
      is_active: (now - lastSeen) < ACTIVE_THRESHOLD_MS,
    }
  })

  return NextResponse.json({ positions })
}
