import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyActiveFilter } from '@/lib/queries/survey-units'

const ROUTE_COLS_DETAIL = 'survey_id, consumer_name, address, psid, amount_due, monthly_fee, arrears, route_seq, route_name, surveyor_name, survey_date, survey_time, lat, lng'

async function fetchAllRows(url: string, batchSize = 1000): Promise<any[]> {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const all: any[] = []
  let offset = 0
  while (true) {
    const res = await fetch(url, {
      headers: {
        apikey: svcKey,
        Authorization: `Bearer ${svcKey}`,
        Range: `${offset}-${offset + batchSize - 1}`,
      },
    })
    if (!res.ok) throw new Error(`PostgREST ${res.status}`)
    const chunk = await res.json()
    if (!chunk?.length) break
    all.push(...chunk)
    offset += chunk.length
    if (chunk.length < batchSize) break
  }
  return all
}

function routeSortKey(name: string): number {
  const m = name.match(/Route[ _](\d+)/i)
  return m ? parseInt(m[1], 10) : 9999
}

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const city = sp.get('city')
  const routeName = sp.get('route')
  const uc = sp.get('uc')
  const tehsil = sp.get('tehsil')
  const sup = await createClient()

  // Mode 1: Get units for a specific route within a city
  if (city && routeName) {
    const countQ = applyActiveFilter(
      sup.from('survey_units').select('survey_id', { count: 'exact', head: true })
    )
      .eq('city_district', city)
      .eq('route_name', routeName)
    if (tehsil) countQ.eq('tehsil', tehsil)
    const { count } = await countQ

    const supUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const filterParts = [
      `city_district=eq.${encodeURIComponent(city)}`,
      `route_name=eq.${encodeURIComponent(routeName)}`,
      'or=(status.is.null,status.eq.ACTIVE)',
    ]
    if (tehsil) filterParts.push(`tehsil=eq.${encodeURIComponent(tehsil)}`)
    const url = `${supUrl}/rest/v1/survey_units?select=${encodeURIComponent(ROUTE_COLS_DETAIL)}&${filterParts.join('&')}&order=route_seq.asc.nullslast`
    let data: any[]
    try {
      data = await fetchAllRows(url)
    } catch (e) {
      return NextResponse.json({ error: `Failed to fetch units: ${(e as Error).message}` }, { status: 500 })
    }

    return NextResponse.json({ data: data || [], total: count || 0 })
  }

  // Mode 2: Get route tree grouped by city → uc → route_name
  try {
    const { data: tree, error } = await sup.rpc('get_route_tree', {
      p_city: city || '',
    })
    if (error) throw error

    // Build tree: city → uc → routes + unrouted count
    const cityMap = new Map<string, {
      ucs: Map<string, { routes: { route_name: string; unit_count: number }[]; unrouted: number }>
    }>()
    for (const row of (tree || []) as Array<{
      city_district: string; tehsil: string; uc_name: string
      route_name: string; unit_count: number; is_unrouted: boolean
    }>) {
      let c = cityMap.get(row.city_district)
      if (!c) { c = { ucs: new Map() }; cityMap.set(row.city_district, c) }
      let u = c.ucs.get(row.uc_name)
      if (!u) { u = { routes: [], unrouted: 0 }; c.ucs.set(row.uc_name, u) }
      if (row.is_unrouted) {
        u.unrouted += row.unit_count
      } else {
        u.routes.push({ route_name: row.route_name, unit_count: row.unit_count })
      }
    }
    // Natural sort by route number
    for (const [, c] of cityMap) {
      for (const [, u] of c.ucs) {
        u.routes.sort((a, b) => routeSortKey(a.route_name) - routeSortKey(b.route_name))
      }
    }

    const data = Array.from(cityMap.entries()).map(([cityName, c]) => ({
      city: cityName,
      ucs: Array.from(c.ucs.entries())
        .sort(([a], [b]) => {
          const aIsMc = a.startsWith('MC-')
          const bIsMc = b.startsWith('MC-')
          if (aIsMc && !bIsMc) return -1
          if (!aIsMc && bIsMc) return 1
          return a.localeCompare(b)
        })
        .map(([ucName, u]) => ({
          uc: ucName,
          routes: u.routes,
          unrouted: u.unrouted,
        })),
    }))

    return NextResponse.json({ data })
  } catch {
    // RPC not yet created — fallback to direct query with filter
    let mode2q = applyActiveFilter(
      sup.from('survey_units').select('city_district, uc_name, route_name')
    )
      .not('route_name', 'is', null)
      .neq('route_name', 'Unrouted')
    if (city) mode2q = mode2q.eq('city_district', city)
    if (tehsil) mode2q = mode2q.eq('tehsil', tehsil)
    const { data: units, error: err2 } = await mode2q
      .range(0, 99999)
      .order('city_district')
      .order('uc_name')
      .order('route_name')

    if (err2) return NextResponse.json({ error: err2.message }, { status: 500 })

    const cities = new Map<string, Map<string, { routes: Map<string, number>; unrouted: number }>>()
    for (const u of (units || []) as Array<{ city_district: string; uc_name: string; route_name: string | null }>) {
      if (!u.route_name) continue
      let cityMap = cities.get(u.city_district)
      if (!cityMap) { cityMap = new Map(); cities.set(u.city_district, cityMap) }
      let ucMap = cityMap.get(u.uc_name)
      if (!ucMap) { ucMap = { routes: new Map(), unrouted: 0 }; cityMap.set(u.uc_name, ucMap) }
      const prev = ucMap.routes.get(u.route_name) || 0
      ucMap.routes.set(u.route_name, prev + 1)
    }
    // Natural sort by route number
    for (const [, ucMap] of cities) {
      for (const [, u] of ucMap) {
        const sorted = Array.from(u.routes.entries())
          .sort(([a], [b]) => routeSortKey(a) - routeSortKey(b))
        u.routes = new Map(sorted)
      }
    }

    const data = Array.from(cities.entries()).map(([c, ucMap]) => ({
      city: c,
      ucs: Array.from(ucMap.entries())
        .sort(([a], [b]) => {
          const aIsMc = a.startsWith('MC-')
          const bIsMc = b.startsWith('MC-')
          if (aIsMc && !bIsMc) return -1
          if (!aIsMc && bIsMc) return 1
          return a.localeCompare(b)
        })
        .map(([uc, { routes, unrouted }]) => ({
          uc,
          routes: Array.from(routes.entries()).map(([route_name, count]) => ({
            route_name, unit_count: count,
          })),
          unrouted,
        })),
    }))

    return NextResponse.json({ data })
  }
}
