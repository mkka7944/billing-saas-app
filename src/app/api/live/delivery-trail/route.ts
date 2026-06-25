import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CITY_TEHSIL_MAP } from '@/lib/queries/hierarchy'
import { pktDayRange } from '@/lib/pkt'

function dayRange(dateStr?: string | null): { start: string; end: string } {
  const d = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : null
  if (!d) return pktDayRange()
  return {
    start: `${d}T00:00:00+05:00`,
    end: `${d}T23:59:59+05:00`,
  }
}

export async function GET(request: Request) {
  const sup = await createClient()

  const { data: { user }, error: authError } = await sup.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = new URL(request.url).searchParams
  const city = sp.get('city') || ''
  const date = sp.get('date')
  const limit = Math.min(parseInt(sp.get('limit') || '50', 10), 200)
  const offset = parseInt(sp.get('offset') || '0', 10)
  const cfg = CITY_TEHSIL_MAP[city]

  if (!cfg) {
    return NextResponse.json({ error: 'Invalid city' }, { status: 400 })
  }

  const { start, end } = dayRange(date)

  // 1. Query survey_units first — scoped to city, returns only matching PSIDs + coords
  const { data: units } = await sup
    .from('survey_units')
    .select('psid, consumer_name, lat, lng')
    .eq('city_district', cfg.district)
    .eq('tehsil', cfg.tehsil)
    .not('psid', 'is', null)

  if (!units?.length) {
    return NextResponse.json({ markers: [], activities: [] })
  }

  // 2. Query assignment_items by PSIDs + date range
  const psids = units.map((u: any) => u.psid)
  const { data: items } = await sup
    .from('assignment_items')
    .select('assignment_id, psid, status, delivered_at')
    .in('status', ['delivered', 'missed', 'processing'])
    .in('psid', psids)
    .gte('delivered_at', start)
    .lte('delivered_at', end)

  if (!items?.length) {
    return NextResponse.json({ markers: [], activities: [] })
  }

  // 3. Query daily_assignments for staff names + UC
  const assignmentIds = [...new Set(items.map((i: any) => i.assignment_id))]
  const { data: assignments } = await sup
    .from('daily_assignments')
    .select('id, staff_id, staff:staff_id(full_name), uc_name')
    .in('id', assignmentIds)

  const staffMap = new Map(
    (assignments || []).map((a: any) => [a.id, { name: a.staff?.full_name || 'Unknown', id: a.staff_id }])
  )
  const ucMap = new Map(
    (assignments || []).map((a: any) => [a.id, a.uc_name || ''])
  )

  // 4. Build maps for fast lookup
  const unitByPsid = new Map(units.map((u: any) => [u.psid, u]))

  // Deduplicate items by PSID for markers — keep highest-priority status, then latest timestamp
  const statusRank: Record<string, number> = { delivered: 0, missed: 1, processing: 2 }
  const bestItemByPsid = new Map<string, any>()
  for (const item of items) {
    const existing = bestItemByPsid.get(item.psid)
    if (!existing) {
      bestItemByPsid.set(item.psid, item)
    } else {
      const existingRank = statusRank[existing.status] ?? 3
      const itemRank = statusRank[item.status] ?? 3
      if (
        itemRank < existingRank ||
        (itemRank === existingRank && new Date(item.delivered_at || 0) > new Date(existing.delivered_at || 0))
      ) {
        bestItemByPsid.set(item.psid, item)
      }
    }
  }

  const markers: any[] = []
  const activities: any[] = []

  // Use deduplicated items for markers, original items for activities
  for (const item of bestItemByPsid.values()) {
    const unit = unitByPsid.get(item.psid)
    if (!unit) continue

    const staffInfo = staffMap.get(item.assignment_id) || { name: 'Unknown', id: null }

    if (unit.lat && unit.lng) {
      markers.push({
        psid: item.psid,
        status: item.status,
        delivered_at: item.delivered_at,
        lat: unit.lat,
        lng: unit.lng,
        uc_name: ucMap.get(item.assignment_id) || '',
        consumer_name: unit.consumer_name,
        staff_name: staffInfo.name,
        staff_id: staffInfo.id,
      })
    }
  }

  // Activities keep all events (not deduplicated) so all staff actions are visible
  for (const item of items) {
    const unit = unitByPsid.get(item.psid)
    if (!unit) continue
    const staffInfo = staffMap.get(item.assignment_id) || { name: 'Unknown', id: null }
    if (item.delivered_at) {
      activities.push({
        staff_name: staffInfo.name,
        psid: item.psid,
        status: item.status,
        delivered_at: item.delivered_at,
      })
    }
  }

  activities.sort((a: any, b: any) => new Date(b.delivered_at).getTime() - new Date(a.delivered_at).getTime())

  const total = activities.length
  const paginatedActivities = activities.slice(offset, offset + limit)

  return NextResponse.json({ markers, activities: paginatedActivities, total })
}
