import { NextResponse } from 'next/server'
import { currentMonth } from '@/lib/constants'
import { CITY_TEHSIL_MAP, type UCStatRow } from '@/lib/queries/hierarchy'

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

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const city = sp.get('city')
    const month = sp.get('month') || currentMonth()

    const cfg = city ? CITY_TEHSIL_MAP[city] : null
    const supUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

    // 1. Total per UC: fetch just uc_name column, count in JavaScript.
    const filterParts = ['psid=not.is.null', 'or=(status.is.null,status.eq.ACTIVE)']
    if (cfg) {
      filterParts.push(`city_district=eq.${cfg.district}`)
      filterParts.push(`tehsil=eq.${cfg.tehsil}`)
    }
    const unitsUrl = `${supUrl}/rest/v1/survey_units?select=uc_name&${filterParts.join('&')}&order=uc_name.asc`
    const allUcNames: { uc_name: string }[] = await fetchAllRows(unitsUrl)

    const ucTotal = new Map<string, number>()
    for (const u of allUcNames) {
      ucTotal.set(u.uc_name, (ucTotal.get(u.uc_name) || 0) + 1)
    }

    // 2. Assigned per UC: sum daily_assignments.total_items (stored at creation time)
    //    Cap at total to prevent cross-city same-name-UC collisions.
    const assignUrl = `${supUrl}/rest/v1/daily_assignments?select=uc_name,total_items&bill_month=eq.${month}`
    const allAssignments: { uc_name: string; total_items: number }[] = await fetchAllRows(assignUrl)

    const ucAssignedRaw = new Map<string, number>()
    for (const a of allAssignments) {
      ucAssignedRaw.set(a.uc_name, (ucAssignedRaw.get(a.uc_name) || 0) + (a.total_items || 0))
    }

    // 3. Build response: assigned = min(raw, total) to avoid >100% from same-name UCs across cities
    const data: UCStatRow[] = Array.from(ucTotal.entries())
      .map(([uc_name, total]) => {
        const raw = ucAssignedRaw.get(uc_name) || 0
        return {
          uc_name,
          total_units: total,
          active_units: total,
          archived_units: 0,
          billed: 0,
          paid: 0,
          collected: 0,
          surveyors: 0,
          no_coords: 0,
          assigned_today: Math.min(raw, total),
          delivered_today: 0,
          missed_today: 0,
          processing_today: 0,
        }
      })
      .sort((a, b) => a.uc_name.localeCompare(b.uc_name))

    return NextResponse.json({ data })
  } catch (e) {
    console.error('UC stats error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
