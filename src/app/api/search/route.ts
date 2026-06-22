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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim()
    const scope = searchParams.get('scope') || 'global'

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

      const { data: profile } = await sup
        .from('profiles')
        .select('staff_id')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile?.staff_id) {
        return NextResponse.json({ results: [] })
      }

      const today = new Date().toISOString().slice(0, 10)

      const { data: assignment } = await sup
        .from('daily_assignments')
        .select('id')
        .eq('staff_id', profile.staff_id)
        .gte('created_at', today)
        .lte('created_at', today + 'T23:59:59.999Z')
        .maybeSingle()

      if (!assignment) {
        return NextResponse.json({ results: [] })
      }

      const { data: itemPsids } = await sup
        .from('assignment_items')
        .select('id, psid')
        .eq('daily_assignment_id', assignment.id)
        .not('psid', 'is', null)

      if (!itemPsids?.length) {
        return NextResponse.json({ results: [] })
      }

      const staffPsids = (itemPsids as any[]).map((r) => r.psid)
      const staffPsidSet = new Set(staffPsids)
      const itemIdByPsid = new Map<string, string>()
      for (const r of itemPsids as any[]) {
        if (r.psid && !itemIdByPsid.has(r.psid)) {
          itemIdByPsid.set(r.psid, r.id)
        }
      }

      const { data: units } = await sup
        .from('survey_units')
        .select(COLS)
        .in('psid', staffPsids)
        .or(`psid.ilike.%${q}%,survey_id.ilike.%${q}%`)
        .limit(30)

      const sorted = prioritySort(
        (units || []).filter((u: any) => staffPsidSet.has(u.psid)),
        q,
        isPsid20
      )

      const results = sorted.map((u: any) => mapResult(u, itemIdByPsid.get(u.psid) || null))
      return NextResponse.json({ results })
    }

    const { data: units } = await sup
      .from('survey_units')
      .select(COLS)
      .or(`psid.ilike.%${q}%,survey_id.ilike.%${q}%`)
      .limit(30)

    const sorted = prioritySort(units || [], q, isPsid20)
    const results = sorted.map((u: any) => mapResult(u))
    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
