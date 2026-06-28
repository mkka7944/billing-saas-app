import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

  if (!city) {
    return NextResponse.json({ error: 'Invalid city' }, { status: 400 })
  }

  const { start, end } = dayRange(date)

  // 1. Get staff in this city
  const { data: staffList } = await sup
    .from('staff')
    .select('id')
    .eq('assigned_city', city)

  if (!staffList?.length) {
    return NextResponse.json({ markers: [], activities: [] })
  }

  const staffIds = staffList.map((s: any) => s.id)

  // 2. Get daily assignments for these staff
  const { data: assignments } = await sup
    .from('daily_assignments')
    .select('id, staff_id, total_items, staff:staff_id(full_name), uc_name')
    .in('staff_id', staffIds)

  if (!assignments?.length) {
    return NextResponse.json({ markers: [], activities: [] })
  }

  const assignmentIds = assignments.map((a: any) => a.id)

  // 3. Get assignment_items for these assignments in the date range
  const { data: items } = await sup
    .from('assignment_items')
    .select('assignment_id, psid, status, delivered_at')
    .in('assignment_id', assignmentIds)
    .in('status', ['delivered', 'missed', 'processing'])
    .gte('delivered_at', start)
    .lte('delivered_at', end)

  if (!items?.length) {
    return NextResponse.json({ markers: [], activities: [] })
  }

  // 4. Get survey_unit data for matching PSIDs
  const psids = [...new Set(items.map((i: any) => i.psid))]
  const { data: units } = await sup
    .from('survey_units')
    .select('psid, consumer_name, lat, lng')
    .in('psid', psids)

  const unitByPsid = new Map((units || []).map((u: any) => [u.psid, u]))

  // 5. Build staff + UC lookup by assignment_id
  const staffMap = new Map(
    assignments.map((a: any) => [a.id, { name: a.staff?.full_name || 'Unknown', id: a.staff_id }])
  )
  const ucMap = new Map(
    assignments.map((a: any) => [a.id, a.uc_name || ''])
  )
  const totalItemsByAssignment = new Map(
    assignments.map((a: any) => [a.id, a.total_items || 0])
  )

  // 6. Staff summary
  const staffSummary: Record<string, {
    staff_id: string
    total_actioned: number
    delivered: number
    missed: number
    processing: number
    assigned: number
    pending: number
  }> = {}
  for (const item of items) {
    const staffInfo = staffMap.get(item.assignment_id) || { name: 'Unknown', id: null }
    const name = staffInfo.name
    if (!staffSummary[name]) {
      const assigned = totalItemsByAssignment.get(item.assignment_id) || 0
      staffSummary[name] = {
        staff_id: staffInfo.id || name,
        total_actioned: 0,
        delivered: 0,
        missed: 0,
        processing: 0,
        assigned,
        pending: assigned,
      }
    }
    staffSummary[name].total_actioned++
    if (item.status === 'delivered') staffSummary[name].delivered++
    else if (item.status === 'missed') staffSummary[name].missed++
    else if (item.status === 'processing') staffSummary[name].processing++
  }

  // Recalculate pending after counting actioned
  for (const entry of Object.values(staffSummary)) {
    entry.pending = Math.max(0, entry.assigned - entry.total_actioned)
  }

  // 7. Deduplicate items by PSID for markers
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

  return NextResponse.json({ markers, activities: paginatedActivities, total, staffSummary })
}
