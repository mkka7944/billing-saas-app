import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ROUTE_UNIT_COLS = 'survey_id, consumer_name, address, psid, amount_due, monthly_fee, arrears, route_seq, lat, lng'

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const city = sp.get('city')
  const routeName = sp.get('route')
  const tehsil = sp.get('tehsil')
  const sup = await createClient()

  // Mode 1: Get units for a specific route within a city
  if (city && routeName) {
    let q = sup
      .from('survey_units')
      .select(ROUTE_UNIT_COLS)
      .eq('city_district', city)
      .eq('route_name', routeName)
      .eq('status', 'ACTIVE')
    if (tehsil) q = q.eq('tehsil', tehsil)
    const { data, error } = await q.order('route_seq', { ascending: true, nullsFirst: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  }

  // Mode 2: Get route tree grouped by city → uc → route_name
  let mode2q = sup
    .from('survey_units')
    .select('city_district, uc_name, route_name')
    .eq('status', 'ACTIVE')
    .not('route_name', 'is', null)
  if (city) mode2q = mode2q.eq('city_district', city)
  if (tehsil) mode2q = mode2q.eq('tehsil', tehsil)
  const { data: units, error } = await mode2q
    .limit(20000)
    .order('city_district')
    .order('uc_name')
    .order('route_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group into tree: city → uc → route
  const cities = new Map<string, Map<string, Map<string, number>>>()
  for (const u of units || []) {
    if (!u.route_name) continue
    let cityMap = cities.get(u.city_district)
    if (!cityMap) { cityMap = new Map(); cities.set(u.city_district, cityMap) }
    let ucMap = cityMap.get(u.uc_name)
    if (!ucMap) { ucMap = new Map(); cityMap.set(u.uc_name, ucMap) }
    const prev = ucMap.get(u.route_name) || 0
    ucMap.set(u.route_name, prev + 1)
  }

  const data = Array.from(cities.entries()).map(([c, ucMap]) => ({
    city: c,
    ucs: Array.from(ucMap.entries()).map(([uc, routeMap]) => ({
      uc,
      routes: Array.from(routeMap.entries()).map(([routeName, count]) => ({
        route_name: routeName,
        unit_count: count,
      })),
    })),
  }))

  return NextResponse.json({ data })
}
