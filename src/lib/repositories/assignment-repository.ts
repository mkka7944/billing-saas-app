import type { SupabaseClient } from '@supabase/supabase-js'
import { applyActiveFilter } from '@/lib/queries/survey-units'
import { CITY_TEHSIL_MAP } from '@/lib/queries/hierarchy'
import { currentMonth } from '@/lib/constants'

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

const ASSIGNMENT_COLS = 'id, staff_id, issued_at, uc_name, total_items, bill_month, created_by, created_at'
const ITEM_COLS = 'id, assignment_id, psid, survey_id, route_seq, status, delivered_at, gps_lat, gps_lng, notes'
const PSID_COLS = 'survey_id, consumer_name, address, lat, lng, psid, monthly_fee, arrears, route_seq, route_name, surveyor_name, survey_date, survey_time'

export interface AssignmentQuery {
  uc?: string
  staffId?: string
  totals: boolean
  list: boolean
  district: string
  tehsil: string
  routeName: string
  month: string
}

export async function getUcTotals(sup: SupabaseClient, q: AssignmentQuery) {
  let hsQ = sup
    .from('hierarchy_summary')
    .select('uc_name, active_units')
    .eq('bill_month', q.month)
  if (q.district) hsQ = hsQ.eq('city_district', q.district)
  if (q.tehsil) hsQ = hsQ.eq('tehsil', q.tehsil)

  const { data: hsRows, error: hsErr } = await hsQ.order('uc_name')
  if (hsErr) return { error: hsErr.message }

  const counts = new Map<string, { total: number; assigned: number }>()
  for (const row of hsRows || []) {
    counts.set(row.uc_name, { total: row.active_units, assigned: 0 })
  }

  const { data: allAssignments } = await sup
    .from('daily_assignments')
    .select('id, uc_name')
    .eq('bill_month', q.month)

  if (allAssignments?.length) {
    type TA = { id: string; uc_name: string }
    const taRows = allAssignments as TA[]
    const ucFromId = new Map(taRows.map((a) => [a.id, a.uc_name]))
    type AI = { assignment_id: string }
    const { data: items } = await sup
      .from('assignment_items')
      .select('assignment_id')
      .in('assignment_id', taRows.map((a) => a.id))

    for (const item of (items as AI[]) || []) {
      const uc = ucFromId.get(item.assignment_id)
      if (uc && counts.has(uc)) counts.get(uc)!.assigned++
    }
  }

  const data = Array.from(counts.entries())
    .map(([uc_name, c]) => ({ uc_name, total: c.total, assigned: c.assigned, unassigned: c.total - c.assigned }))
    .sort((a, b) => a.uc_name.localeCompare(b.uc_name))

  return { data }
}

export async function getAssignmentList(sup: SupabaseClient, q: AssignmentQuery) {
  let query = sup
    .from('daily_assignments')
    .select(ASSIGNMENT_COLS)

  if (q.month) query = query.eq('bill_month', q.month)

  // Filter by district/tehsil via hierarchy_summary UC names
  if (q.district) {
    let hsQuery = sup
      .from('hierarchy_summary')
      .select('uc_name')
      .eq('city_district', q.district)
    if (q.tehsil) hsQuery = hsQuery.eq('tehsil', q.tehsil)

    const { data: ucRows } = await hsQuery

    const ucNames = [...new Set((ucRows || []).map(r => r.uc_name))]
    if (!ucNames.length) return { data: [] }
    query = query.in('uc_name', ucNames)
  }

  const { data: assignments } = await query.order('created_at', { ascending: false })

  if (!assignments?.length) return { data: [] }

  type DA = { id: string; staff_id: string; issued_at: string; uc_name: string; total_items: number; bill_month: string; created_by: string; created_at: string }
  const daRows = assignments as DA[]
  const staffIds = [...new Set(daRows.map((a) => a.staff_id))]
  type SR = { id: string; full_name: string | null }
  const { data: staffRows } = await sup
    .from('staff')
    .select('id, full_name')
    .in('id', staffIds)

  const staffNameMap = new Map((staffRows as SR[] || []).map((s) => [s.id, s.full_name || 'Unknown']))

  const assignmentIds = daRows.map((a) => a.id)
  const { data: allItems } = await sup
    .from('assignment_items')
    .select('assignment_id, status')
    .in('assignment_id', assignmentIds)

  const itemCounts = new Map<string, { pending: number; processing: number; delivered: number; missed: number }>()
  for (const item of allItems || []) {
    const c = itemCounts.get(item.assignment_id) || { pending: 0, processing: 0, delivered: 0, missed: 0 }
    const key = item.status as string
    if (key in c) (c as Record<string, number>)[key]++
    itemCounts.set(item.assignment_id, c)
  }

  const data = daRows.map((a) => {
    const counts = itemCounts.get(a.id) || { pending: 0, processing: 0, delivered: 0, missed: 0 }
    const completed = counts.delivered + counts.missed
    return {
      id: a.id,
      staff_id: a.staff_id,
      staff_name: staffNameMap.get(a.staff_id) || 'Unknown',
      issued_at: a.issued_at,
      uc_name: a.uc_name,
      total_items: a.total_items,
      bill_month: a.bill_month,
      ...counts,
      completion_pct: a.total_items > 0 ? Math.round((completed / a.total_items) * 100) : 0,
      created_at: a.created_at,
    }
  })

  return { data }
}

export async function getUnassignedBills(sup: SupabaseClient, q: AssignmentQuery) {
  const { data: existingAssignments } = await sup
    .from('daily_assignments')
    .select('id')
    .eq('uc_name', q.uc)

  type ExDA = { id: string }
  const existingIds = ((existingAssignments || []) as ExDA[]).map((a) => a.id)
  const excludePsids = new Set<string>()
  if (existingIds.length) {
    const { data: existingItems } = await sup
      .from('assignment_items')
      .select('psid')
      .in('assignment_id', existingIds)
    for (const e of existingItems || []) excludePsids.add(e.psid)
  }

  const supUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const filterParts = [
    `uc_name=eq.${encodeURIComponent(q.uc!)}`,
    'psid=not.is.null',
    'or=(status.is.null,status.eq.ACTIVE)',
  ]
  if (q.routeName) filterParts.push(`route_name=eq.${encodeURIComponent(q.routeName)}`)
  const sortOrder = q.routeName ? 'route_seq.asc.nullslast' : 'survey_id.desc'
  const url = `${supUrl}/rest/v1/survey_units?select=${encodeURIComponent(PSID_COLS)}&${filterParts.join('&')}&order=${sortOrder}`

  let data: any[]
  try {
    data = await fetchAllRows(url)
  } catch (e) {
    return { error: `Failed to fetch units: ${(e as Error).message}` }
  }

  type SU = { psid: string | null }
  const unassigned = ((data || []) as SU[]).filter((s) => s.psid && !excludePsids.has(s.psid))
  return { data: unassigned, total: unassigned.length }
}

export async function getStaffAssignment(sup: SupabaseClient, q: AssignmentQuery) {
  const { data: assignments, error: ae } = await sup
    .from('daily_assignments')
    .select(ASSIGNMENT_COLS)
    .eq('staff_id', q.staffId)
    .eq('bill_month', q.month)
    .order('created_at', { ascending: false })

  if (ae) return { error: ae.message }
  if (!assignments?.length) return { data: null, items: [] }

  const assignmentIds = (assignments as any[]).map((a) => a.id)
  const { data: items, error: ie } = await sup
    .from('assignment_items')
    .select(ITEM_COLS)
    .in('assignment_id', assignmentIds)
    .order('route_seq', { ascending: true, nullsFirst: false })

  if (ie) return { error: ie.message }

  const psids = (items || []).map((i: any) => i.psid)
  const { data: units } = psids.length
    ? await sup
        .from('survey_units')
        .select('psid, survey_id, consumer_name, address, lat, lng, monthly_fee, arrears, route_name, route_seq, uc_name, image_urls')
        .in('psid', psids)
    : { data: [] }

  const unitMap = new Map((units || []).map((u: any) => [u.psid, u]))
  const itemsWithUnits = (items || []).map((item: any) => ({
    ...item,
    unit: unitMap.get(item.psid) || null,
  }))

  return { data: (assignments as any[])[0], items: itemsWithUnits }
}

export async function createAssignment(
  sup: SupabaseClient,
  body: { staff_id: string; issued_at?: string; uc_name: string; psids: string[]; bill_month?: string }
) {
  const { staff_id, uc_name, psids } = body
  const issued_at = body.issued_at || new Date().toISOString().slice(0, 10)
  const bill_month = body.bill_month || currentMonth()

  if (!staff_id || !uc_name || !psids?.length) {
    return { error: 'staff_id, uc_name, and psids[] required' }
  }

  // Validate staff's assigned_city matches the UC's city
  const { data: staffRow } = await sup
    .from('staff')
    .select('full_name, assigned_city')
    .eq('id', staff_id)
    .single()

  if (staffRow?.assigned_city) {
    const staffCityCfg = CITY_TEHSIL_MAP[staffRow.assigned_city as string]
    if (staffCityCfg) {
      const { data: ucRow } = await sup
        .from('survey_units')
        .select('city_district, tehsil')
        .eq('uc_name', uc_name)
        .limit(1)
        .maybeSingle()

      if (ucRow && (ucRow.city_district !== staffCityCfg.district || ucRow.tehsil !== staffCityCfg.tehsil)) {
        return {
          error: `Staff "${(staffRow as any).full_name || staff_id}" is assigned to ${staffRow.assigned_city} but UC "${uc_name}" belongs to a different city`,
          status: 400,
        }
      }
    }
  }

  const { data: units } = await sup
    .from('survey_units')
    .select('psid, route_seq, survey_id')
    .in('psid', psids)

  type SU2 = { psid: string; route_seq: number | null; survey_id: string | null }
  const seqMap = new Map(((units || []) as SU2[]).map((u) => [u.psid, u.route_seq || 0]))
  const surveyIdMap = new Map(((units || []) as SU2[]).map((u) => [u.psid, u.survey_id]))

  const { data: assignment, error: ae } = await sup
    .from('daily_assignments')
    .insert({ staff_id, issued_at, uc_name, total_items: psids.length, bill_month })
    .select(ASSIGNMENT_COLS)
    .single()

  if (ae) return { error: ae.message }

  const items = psids.map((psid) => ({
    assignment_id: assignment.id,
    psid,
    survey_id: surveyIdMap.get(psid) || null,
    route_seq: seqMap.get(psid) || 0,
  }))

  const { data: createdItems, error: ie } = await sup
    .from('assignment_items')
    .insert(items)
    .select(ITEM_COLS)

  if (ie) {
    await sup.from('daily_assignments').delete().eq('id', assignment.id)
    return { error: ie.message }
  }

  return { data: assignment, items: createdItems || [] }
}

export async function deleteAssignment(sup: SupabaseClient, id: string) {
  if (!id) return { error: 'id query param required' }

  const { data: assignment, error: fe } = await sup
    .from('daily_assignments')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (fe) return { error: fe.message }
  if (!assignment) return { error: 'Assignment not found', status: 404 }

  const { error: de } = await sup.from('daily_assignments').delete().eq('id', id)
  if (de) return { error: de.message }

  return { success: true }
}
