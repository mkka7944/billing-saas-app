import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const COLS = 'psid, survey_id, consumer_name, address, lat, lng, uc_name'

function isPsidQuery(q: string) {
  return /^\d{20}$/.test(q)
}

function mapResult(u: any, assignmentItemId: string | null = null) {
  return {
    psid: u.psid,
    survey_id: u.survey_id,
    consumer_name: u.consumer_name,
    address: u.address,
    lat: u.lat,
    lng: u.lng,
    uc_name: u.uc_name,
    assignment_item_id: assignmentItemId,
  }
}

function prioritySort(units: any[], q: string, isPsid20: boolean) {
  return (units || [])
    .sort((a: any, b: any) => {
      if (isPsid20) {
        const aScore = a.psid === q ? 0 : a.psid?.includes(q) ? 1 : 2
        const bScore = b.psid === q ? 0 : b.psid?.includes(q) ? 1 : 2
        return aScore - bScore
      }
      const aScore = a.survey_id?.includes(q) ? 0 : 1
      const bScore = b.survey_id?.includes(q) ? 0 : 1
      return aScore - bScore
    })
    .slice(0, 20)
}

function applySearchFilter(query: any, q: string, mode: string) {
  if (mode === 'psid') {
    return query.ilike('psid', `%${q}%`)
  }
  if (mode === 'sid') {
    return query.ilike('survey_id', `%${q}%`)
  }
  return query.or(`psid.ilike.%${q}%,survey_id.ilike.%${q}%`)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim()
    const scope = searchParams.get('scope') || 'global'
    const mode = searchParams.get('mode') || 'both'

    if (!q) {
      return NextResponse.json({ results: [] })
    }

    const sup = await createClient()
    const isPsid20 = isPsidQuery(q)

    if (scope === 'assignment') {
      const { data: { user } } = await sup.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { data: assignments } = await sup
        .from('daily_assignments')
        .select('id')
        .eq('staff_id', user.id)

      if (!assignments?.length) {
        return NextResponse.json({ results: [] })
      }

      const assignmentIds = (assignments as any[]).map((a) => a.id)

      let itemQuery = sup
        .from('assignment_items')
        .select('id, psid, survey_id')
        .in('assignment_id', assignmentIds)
        .not('psid', 'is', null)

      itemQuery = applySearchFilter(itemQuery, q, mode)
      const { data: matchingItems } = await itemQuery.limit(30)

      if (!matchingItems?.length) {
        return NextResponse.json({ results: [] })
      }

      const matchPsids = [...new Set(matchingItems.map((i: any) => i.psid))] as string[]
      const itemIdByPsid = new Map<string, string>()
      for (const i of matchingItems as any[]) {
        if (!itemIdByPsid.has(i.psid)) itemIdByPsid.set(i.psid, i.id)
      }

      const { data: units } = await sup.from('survey_units').select(COLS).in('psid', matchPsids)
      const unitByPsid = new Map((units || []).map((u: any) => [u.psid, u]))

      const results = matchingItems.map((i: any) => {
        const u = unitByPsid.get(i.psid)
        return {
          psid: i.psid,
          survey_id: i.survey_id,
          consumer_name: u?.consumer_name || null,
          address: u?.address || null,
          lat: u?.lat || null,
          lng: u?.lng || null,
          uc_name: u?.uc_name || null,
          assignment_item_id: i.id,
        }
      })

      const sorted = prioritySort(results, q, isPsid20)
      return NextResponse.json({ results: sorted })
    }

    let query = sup.from('survey_units').select(COLS)
    query = applySearchFilter(query, q, mode)
    const { data: units } = await query.limit(30)

    const sorted = prioritySort(units || [], q, isPsid20)
    const results = sorted.map((u: any) => mapResult(u))
    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
