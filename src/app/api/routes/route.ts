import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ROUTE_UNIT_COLS = 'survey_id, consumer_name, address, psid, amount_due, route_seq, lat, lng'

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const city = sp.get('city')
  const routeName = sp.get('route')
  const sup = await createClient()

  // Mode 1: Get units for a specific route within a city
  if (city && routeName) {
    const { data, error } = await sup
      .from('survey_units')
      .select(ROUTE_UNIT_COLS)
      .eq('city_district', city)
      .eq('route_name', routeName)
      .eq('status', 'ACTIVE')
      .order('route_seq', { ascending: true, nullsFirst: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  }

  // Mode 2: Get all route groups grouped by city → uc → route_name
  const { data: units, error } = await sup
    .from('survey_units')
    .select('city_district, uc_name, route_name, route_seq, survey_id, consumer_name')
    .eq('status', 'ACTIVE')
    .not('route_name', 'is', null)
    .range(0, 1_000_000)
    .order('city_district')
    .order('uc_name')
    .order('route_name')
    .order('route_seq', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group into tree: city → uc → route
  const cities = new Map<string, Map<string, Map<string, { route_seq: number; survey_id: string; consumer_name: string | null }[]>>>()
  for (const u of units || []) {
    if (!u.route_name) continue
    let cityMap = cities.get(u.city_district)
    if (!cityMap) { cityMap = new Map(); cities.set(u.city_district, cityMap) }
    let ucMap = cityMap.get(u.uc_name)
    if (!ucMap) { ucMap = new Map(); cityMap.set(u.uc_name, ucMap) }
    let routeList = ucMap.get(u.route_name)
    if (!routeList) { routeList = []; ucMap.set(u.route_name, routeList) }
    routeList.push({ route_seq: u.route_seq || 0, survey_id: u.survey_id, consumer_name: u.consumer_name })
  }

  const data = Array.from(cities.entries()).map(([city, ucMap]) => ({
    city,
    ucs: Array.from(ucMap.entries()).map(([uc, routeMap]) => ({
      uc,
      routes: Array.from(routeMap.entries()).map(([routeName, units]) => ({
        route_name: routeName,
        unit_count: units.length,
        first_stop: units[0]?.consumer_name || null,
        last_stop: units[units.length - 1]?.consumer_name || null,
      })),
    })),
  }))

  return NextResponse.json({ data })
}
