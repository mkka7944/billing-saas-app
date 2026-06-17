import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CITY_TEHSIL_MAP } from '@/lib/queries/hierarchy'
import { pktDayRange } from '@/lib/pkt'

export async function GET(request: Request) {
  const sup = await createClient()

  const { data: { user }, error: authError } = await sup.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = new URL(request.url).searchParams
  const city = sp.get('city') || ''
  const cfg = CITY_TEHSIL_MAP[city]

  if (!cfg) {
    return NextResponse.json({ error: 'Invalid city' }, { status: 400 })
  }

  const { start, end } = pktDayRange()

  const { data: items } = await sup
    .from('assignment_items')
    .select('assignment_id, psid, status, delivered_at, gps_lat, gps_lng')
    .in('status', ['delivered', 'missed', 'processing'])
    .gte('delivered_at', start)
    .lte('delivered_at', end)

  if (!items?.length) {
    return NextResponse.json({ markers: [], activities: [] })
  }

  const assignmentIds = [...new Set(items.map((i: any) => i.assignment_id))]

  const { data: assignments } = await sup
    .from('daily_assignments')
    .select('id, staff:staff_id(full_name), uc_name')
    .in('id', assignmentIds)

  const staffMap = new Map(
    (assignments || []).map((a: any) => [a.id, a.staff?.full_name || 'Unknown'])
  )
  const ucMap = new Map(
    (assignments || []).map((a: any) => [a.id, a.uc_name || ''])
  )

  const psids = [...new Set(items.map((i: any) => i.psid))]

  const { data: units } = await sup
    .from('survey_units')
    .select('psid, consumer_name, lat, lng, city_district, tehsil')
    .in('psid', psids)

  const unitMap = new Map((units || []).map((u: any) => [u.psid, u]))

  const markers: any[] = []
  const activities: any[] = []

  for (const item of items) {
    const unit = unitMap.get(item.psid)
    if (!unit) continue

    if (unit.city_district !== cfg.district) continue
    if (unit.tehsil !== cfg.tehsil) continue

    const staffName = staffMap.get(item.assignment_id) || 'Unknown'
    const ucName = ucMap.get(item.assignment_id) || ''

    if (unit.lat && unit.lng) {
      markers.push({
        psid: item.psid,
        status: item.status,
        delivered_at: item.delivered_at,
        lat: unit.lat,
        lng: unit.lng,
        uc_name: ucName,
        consumer_name: unit.consumer_name,
        staff_name: staffName,
      })
    }

    if (item.delivered_at) {
      const t = new Date(item.delivered_at)
      const hours = t.getHours()
      const mins = t.getMinutes().toString().padStart(2, '0')
      const ampm = hours >= 12 ? 'PM' : 'AM'
      const h12 = hours % 12 || 12

      activities.push({
        staff_name: staffName,
        psid: item.psid,
        status: item.status,
        delivered_at: item.delivered_at,
        time_label: `${h12}:${mins} ${ampm}`,
      })
    }
  }

  activities.sort((a: any, b: any) => new Date(b.delivered_at).getTime() - new Date(a.delivered_at).getTime())

  return NextResponse.json({ markers, activities })
}
