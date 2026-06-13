import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentMonth } from '@/lib/constants'
import { CITY_TEHSIL_MAP, type UCStatRow } from '@/lib/queries/hierarchy'

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const city = sp.get('city')
  const month = sp.get('month') || currentMonth()

  const sup = await createClient()

  const cfg = city ? CITY_TEHSIL_MAP[city] : null

  let summaryQ = sup
    .from('hierarchy_summary')
    .select('uc_name, total_units, active_units, archived_units, billed_units, paid_units, total_collected, surveyors, no_coords')
    .eq('bill_month', month)

  if (cfg) {
    summaryQ = summaryQ
      .eq('city_district', cfg.district)
      .eq('tehsil', cfg.tehsil)
  }

  const { data: summaryRows, error: summaryErr } = await summaryQ.order('uc_name')

  if (summaryErr) {
    return NextResponse.json({ error: summaryErr.message }, { status: 500 })
  }

  const ucRowMap = new Map<string, UCStatRow>()
  for (const row of summaryRows || []) {
    ucRowMap.set(row.uc_name, {
      uc_name: row.uc_name,
      total_units: row.total_units,
      active_units: row.active_units,
      archived_units: row.archived_units,
      billed: row.billed_units,
      paid: row.paid_units,
      collected: row.total_collected,
      surveyors: row.surveyors,
      no_coords: row.no_coords,
      assigned_today: 0,
      delivered_today: 0,
      missed_today: 0,
      processing_today: 0,
    })
  }

  // Count all assignments (not just today's) to show correct assignment progress per UC
  const { data: allAssignments } = await sup
    .from('daily_assignments')
    .select('id, uc_name')

  if (allAssignments?.length) {
    type AssignmentRow = { id: string; uc_name: string }
    const rows = allAssignments as AssignmentRow[]
    const assignmentIds = rows.map((a) => a.id)
    const ucByAssignmentId = new Map(rows.map((a) => [a.id, a.uc_name] as const))

    type ItemRow = { assignment_id: string; status: string | null }
    const { data: itemCounts } = await sup
      .from('assignment_items')
      .select('assignment_id, status')
      .in('assignment_id', assignmentIds)

    const acc = new Map<string, { assigned: number; delivered: number; missed: number; processing: number }>()
    for (const item of (itemCounts as ItemRow[]) || []) {
      const uc = ucByAssignmentId.get(item.assignment_id)
      if (!uc) continue
      if (!acc.has(uc)) acc.set(uc, { assigned: 0, delivered: 0, missed: 0, processing: 0 })
      const c = acc.get(uc)!
      c.assigned++
      if (item.status === 'delivered') c.delivered++
      if (item.status === 'missed') c.missed++
      if (item.status === 'processing') c.processing++
    }

    for (const [ucName, counts] of acc) {
      const existing = ucRowMap.get(ucName)
      if (existing) {
        existing.assigned_today = counts.assigned
        existing.delivered_today = counts.delivered
        existing.missed_today = counts.missed
        existing.processing_today = counts.processing
      } else if (!cfg) {
        ucRowMap.set(ucName, {
          uc_name: ucName,
          total_units: 0,
          active_units: 0,
          archived_units: 0,
          billed: 0,
          paid: 0,
          collected: 0,
          surveyors: 0,
          no_coords: 0,
          assigned_today: counts.assigned,
          delivered_today: counts.delivered,
          missed_today: counts.missed,
          processing_today: counts.processing,
        })
      }
    }
  }

  const data = Array.from(ucRowMap.values()).sort((a, b) => a.uc_name.localeCompare(b.uc_name))

  return NextResponse.json({ data })
}
