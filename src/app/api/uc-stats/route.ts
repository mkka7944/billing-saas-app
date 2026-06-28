import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentMonth } from '@/lib/constants'
import { CITY_TEHSIL_MAP, type UCStatRow } from '@/lib/queries/hierarchy'

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const city = sp.get('city')
    const month = sp.get('month') || currentMonth()

    const cfg = city ? CITY_TEHSIL_MAP[city] : null
    const sup = await createClient()

    // 1. Get UC names from the hierarchy reference table (always < 500 rows)
    let hierarchyQuery = sup.from('hierarchy').select('uc_name, tehsil')
    if (cfg) {
      hierarchyQuery = hierarchyQuery
        .eq('city_district', cfg.district)
        .eq('tehsil', cfg.tehsil)
    }
    const { data: hierarchy } = await hierarchyQuery
    const ucNames = [...new Set((hierarchy || []).map((h: any) => h.uc_name))]

    // 2. Count survey_units per UC (server-side aggregate queries)
    const counts = await Promise.all(
      ucNames.map(async (uc) => {
        let query = sup
          .from('survey_units')
          .select('*', { count: 'exact', head: true })
          .eq('uc_name', uc as string)
          .not('psid', 'is', null)
          .or('status.is.null,status.eq.ACTIVE')
        if (cfg) {
          query = query.eq('city_district', cfg.district).eq('tehsil', cfg.tehsil)
        }
        const { count } = await query
        return { uc_name: uc as string, total: count ?? 0 }
      })
    )

    const ucTotal = new Map(counts.map((c) => [c.uc_name, c.total]))

    // 3. Assigned per UC: sum daily_assignments.total_items for this month
    const { data: assignments } = await sup
      .from('daily_assignments')
      .select('uc_name, total_items')
      .eq('bill_month', month)

    const ucAssignedRaw = new Map<string, number>()
    for (const a of (assignments || []) as { uc_name: string; total_items: number }[]) {
      ucAssignedRaw.set(a.uc_name, (ucAssignedRaw.get(a.uc_name) || 0) + (a.total_items || 0))
    }

    // 4. Build response
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
