import type { SupabaseClient } from '@supabase/supabase-js'
import { applyActiveFilter } from '@/lib/queries/survey-units'
import { CITY_TEHSIL_MAP } from '@/lib/queries/hierarchy'
import { currentMonth } from '@/lib/constants'
import { pktDayRange } from '@/lib/pkt'

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

const ASSIGNMENT_COLS = 'id, staff_id, issued_at, uc_name, uc_names, name, target_per_day, total_items, bill_month, created_by, created_at'
const ITEM_COLS = 'id, assignment_id, psid, survey_id, route_seq, status, started_at, delivered_at, gps_lat, gps_lng, notes'
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
    const supUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ids = taRows.map((a) => a.id)
    const filter = `assignment_id=in.(${ids.join(',')})`
    const url = `${supUrl}/rest/v1/assignment_items?select=assignment_id&${filter}`
    const items = await fetchAllRows(url)

    for (const item of (items || []) as { assignment_id: string }[]) {
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
  const supUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const filter = `assignment_id=in.(${assignmentIds.join(',')})`
  const url = `${supUrl}/rest/v1/assignment_items?select=${encodeURIComponent('assignment_id,status')}&${filter}`
  let allItems: any[]
  try {
    allItems = await fetchAllRows(url)
  } catch (e) {
    return { error: `Failed to fetch assignment items: ${(e as Error).message}` }
  }

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
      name: (a as any).name,
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
    const supUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const filter = `assignment_id=in.(${existingIds.join(',')})`
    const url = `${supUrl}/rest/v1/assignment_items?select=psid&${filter}`
    const existingItems = await fetchAllRows(url)
    for (const e of (existingItems || []) as { psid: string }[]) excludePsids.add(e.psid)
  }

  const supUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const filterParts = [
    `uc_name=eq.${encodeURIComponent(q.uc!)}`,
    'psid=not.is.null',
    'or=(status.is.null,status.eq.ACTIVE)',
  ]
  if (q.district) filterParts.push(`city_district=eq.${encodeURIComponent(q.district)}`)
  if (q.tehsil) filterParts.push(`tehsil=eq.${encodeURIComponent(q.tehsil)}`)
  if (q.routeName) filterParts.push(`route_name=eq.${encodeURIComponent(q.routeName)}`)
  const sortOrder = q.routeName ? 'route_seq.asc.nullslast' : 'survey_id.asc'
  const url = `${supUrl}/rest/v1/survey_units?select=${encodeURIComponent(PSID_COLS)}&${filterParts.join('&')}&order=${sortOrder}&limit=1000`

  let data: any[]
  try {
    data = await fetchAllRows(url)
  } catch (e) {
    return { error: `Failed to fetch units: ${(e as Error).message}` }
  }

  const unassigned = ((data || []) as any[])
    .filter((s) => s.psid && !excludePsids.has(s.psid))
    .sort((a: any, b: any) => {
      const aNum = parseInt(a.survey_id?.replace(/\D/g, '') || '0', 10)
      const bNum = parseInt(b.survey_id?.replace(/\D/g, '') || '0', 10)
      return bNum - aNum
    })
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
  const supUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const filter = `assignment_id=in.(${assignmentIds.join(',')})`
  const url = `${supUrl}/rest/v1/assignment_items?select=${encodeURIComponent(ITEM_COLS)}&${filter}&order=route_seq.asc.nullslast`
  let items: any[]
  try {
    items = await fetchAllRows(url)
  } catch (e) {
    return { error: `Failed to fetch items: ${(e as Error).message}` }
  }

  const psids = (items || []).map((i: any) => i.psid)
  const UNIT_COLS = 'psid, survey_id, consumer_name, address, lat, lng, monthly_fee, arrears, route_name, route_seq, uc_name'
  let units: any[]
  if (psids.length) {
    const supUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    units = []
    const chunkSize = 300
    for (let i = 0; i < psids.length; i += chunkSize) {
      const chunk = psids.slice(i, i + chunkSize)
      const filter = `psid=in.(${chunk.join(',')})`
      const url = `${supUrl}/rest/v1/survey_units?select=${encodeURIComponent(UNIT_COLS)}&${filter}`
      try {
        const rows = await fetchAllRows(url)
        units.push(...rows)
      } catch (e) {
        return { error: `Failed to fetch units: ${(e as Error).message}` }
      }
    }
  } else {
    units = []
  }

  // Check for same PSIDs delivered today by other staff (use service_role to bypass RLS)
  const staffOtherMap = new Map<string, string | null>()
  if (psids.length) {
    const { start, end } = pktDayRange()
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const HEADERS = { apikey: svcKey, Authorization: `Bearer ${svcKey}` }
    const todayDeliveries: any[] = []
    // Chunk PSIDs at 300 to avoid URL length limit
    const chunkSize = 300
    for (let i = 0; i < psids.length; i += chunkSize) {
      const chunk = psids.slice(i, i + chunkSize)
      const url = `${supUrl}/rest/v1/assignment_items?select=psid,assignment_id,delivered_at&psid=in.(${chunk.join(',')})&status=eq.delivered&delivered_at=gte.${encodeURIComponent(start)}&delivered_at=lte.${encodeURIComponent(end)}`
      const res = await fetch(url, { headers: HEADERS })
      if (res.ok) {
        todayDeliveries.push(...await res.json())
      }
    }
    if (todayDeliveries.length) {
      const ownIds = new Set(assignmentIds)
      const otherItems = todayDeliveries.filter((d: any) => !ownIds.has(d.assignment_id))
      if (otherItems.length) {
        const otherAssIds = [...new Set(otherItems.map((d: any) => d.assignment_id))]
        const assignsRes = await fetch(`${supUrl}/rest/v1/daily_assignments?select=id,staff_id&id=in.(${otherAssIds.join(',')})`, { headers: HEADERS })
        const otherAssigns: any[] = assignsRes.ok ? await assignsRes.json() : []
        const otherStaffIds = [...new Set(otherAssigns.map((a: any) => a.staff_id))]
        const staffRes = await fetch(`${supUrl}/rest/v1/staff?select=id,full_name&id=in.(${otherStaffIds.join(',')})`, { headers: HEADERS })
        const otherStaff: any[] = staffRes.ok ? await staffRes.json() : []
        const staffNameMap = new Map(otherStaff.map((s: any) => [s.id, s.full_name]))
        const assignStaffMap = new Map(otherAssigns.map((a: any) => [a.id, a.staff_id]))
        // For each PSID, keep only the most recent delivery
        const latestByPsid = new Map<string, string | null>()
        for (const o of otherItems) {
          const existing = latestByPsid.get(o.psid)
          if (!existing || o.delivered_at > existing) {
            const sid = assignStaffMap.get(o.assignment_id)
            latestByPsid.set(o.psid, sid ? (staffNameMap.get(sid) || null) : null)
          }
        }
        for (const [psid, name] of latestByPsid) {
          staffOtherMap.set(psid, name)
        }
      }
    }
  }

  const unitMap = new Map((units || []).map((u: any) => [u.psid, u]))
  const itemsWithUnits = (items || []).map((item: any) => ({
    ...item,
    unit: unitMap.get(item.psid) || null,
    deliveredByOther: staffOtherMap.has(item.psid),
    deliveredByStaffName: staffOtherMap.get(item.psid) || null,
  }))

  return { data: (assignments as any[])[0], items: itemsWithUnits }
}

export async function createAssignment(
  sup: SupabaseClient,
  body: { staff_id: string; issued_at?: string; uc_name: string; psids: string[]; bill_month?: string; routeSeqMap?: Record<string, number>; target_per_day?: number }
) {
  const { staff_id, uc_name, psids, routeSeqMap, target_per_day } = body
  const issued_at = body.issued_at || new Date().toISOString().slice(0, 10)
  const bill_month = body.bill_month || currentMonth()

  if (!staff_id || !psids?.length) {
    return { error: 'staff_id and psids[] required' }
  }

  // Fetch unit metadata for all selected PSIDs (batched to bypass 1000-row limit)
  const supUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const FECTH_COLS = 'psid, route_seq, survey_id, uc_name, city_district, tehsil'
  const allUnits: any[] = []
  const chunkSize = 300
  for (let i = 0; i < psids.length; i += chunkSize) {
    const chunk = psids.slice(i, i + chunkSize)
    const filter = `psid=in.(${chunk.join(',')})`
    const url = `${supUrl}/rest/v1/survey_units?select=${encodeURIComponent(FECTH_COLS)}&${filter}`
    try {
      const rows = await fetchAllRows(url)
      allUnits.push(...rows)
    } catch (e) {
      return { error: `Failed to fetch units: ${(e as Error).message}` }
    }
  }

  type SU2 = { psid: string; route_seq: number | null; survey_id: string | null; uc_name: string | null; city_district: string | null; tehsil: string | null }
  const unitRows = allUnits as SU2[]

  // Validate staff's assigned_city matches ALL UCs in the selection
  const { data: staffRow } = await sup
    .from('staff')
    .select('full_name, assigned_city')
    .eq('id', staff_id)
    .single()

  if (staffRow?.assigned_city) {
    const staffCityCfg = CITY_TEHSIL_MAP[staffRow.assigned_city as string]
    if (staffCityCfg) {
      const seen = new Set<string>()
      for (const u of unitRows) {
        if (!u.uc_name || seen.has(u.uc_name)) continue
        seen.add(u.uc_name)
        if (u.city_district !== staffCityCfg.district || u.tehsil !== staffCityCfg.tehsil) {
          return {
            error: `Staff "${(staffRow as any).full_name || staff_id}" is assigned to ${staffRow.assigned_city} but UC "${u.uc_name}" belongs to a different city`,
            status: 400,
          }
        }
      }
    }
  }

  const ucNames = [...new Set(unitRows.map((u) => u.uc_name).filter(Boolean) as string[])]
  const surveyIdMap = new Map(unitRows.map((u) => [u.psid, u.survey_id]))

  // Auto-generate batch name: {City}-B{seq} (checkbox-based only)
  let batchName = ''
  if (routeSeqMap && unitRows.length > 0) {
    const firstUnit = unitRows[0]
    if (firstUnit?.city_district && firstUnit?.tehsil) {
      let cityName = ''
      for (const [cn, cfg] of Object.entries(CITY_TEHSIL_MAP)) {
        if (cfg.district === firstUnit.city_district && cfg.tehsil === firstUnit.tehsil) { cityName = cn; break }
      }
      if (cityName) {
        const { data: existingBatches } = await sup
          .from('daily_assignments')
          .select('name')
          .like('name', `${cityName}-B%`)
        let maxSeq = 0
        for (const b of (existingBatches || []) as { name: string }[]) {
          const m = b.name.match(/-B(\d+)$/)
          if (m) { const n = parseInt(m[1], 10); if (n > maxSeq) maxSeq = n }
        }
        batchName = `${cityName}-B${maxSeq + 1}`
      }
    }
  }

  const { data: assignment, error: ae } = await sup
    .from('daily_assignments')
    .insert({ staff_id, issued_at, uc_name: ucNames[0] || uc_name, uc_names: ucNames, name: batchName, total_items: psids.length, bill_month, target_per_day })
    .select(ASSIGNMENT_COLS)
    .single()

  if (ae) return { error: ae.message }

  const items = psids.map((psid) => ({
    assignment_id: assignment.id,
    psid,
    survey_id: surveyIdMap.get(psid) || null,
    route_seq: routeSeqMap?.[psid] ?? (psids.indexOf(psid) + 1),
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

export async function refreshAssignment(sup: SupabaseClient, assignmentId: string) {
  // Get current assignment details
  const { data: assignment, error: fe } = await sup
    .from('daily_assignments')
    .select('id, uc_name, bill_month')
    .eq('id', assignmentId)
    .single()

  if (fe) return { error: fe.message }
  if (!assignment) return { error: 'Assignment not found', status: 404 }

  // Delete pending items
  const { data: deletedItems } = await sup
    .from('assignment_items')
    .delete()
    .eq('assignment_id', assignmentId)
    .eq('status', 'pending')
    .select('psid')

  const deletedCount = (deletedItems || []).length
  if (!deletedCount) return { data: assignment, items: [], inserted: 0 }

  // Find already-assigned PSIDs for this UC (exclude current assignment's non-pending items)
  const { data: allAssignments } = await sup
    .from('daily_assignments')
    .select('id')
    .eq('uc_name', assignment.uc_name)
    .neq('id', assignmentId)

  const otherIds = ((allAssignments || []) as { id: string }[]).map((a) => a.id)
  const excludePsids = new Set<string>()
  if (otherIds.length) {
    const { data: otherItems } = await sup
      .from('assignment_items')
      .select('psid')
      .in('assignment_id', otherIds)
    for (const e of otherItems || []) excludePsids.add(e.psid)
  }

  // Fetch fresh active units for this UC (excluding already-assigned)
  const supUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const filterParts = [
    `uc_name=eq.${encodeURIComponent(assignment.uc_name)}`,
    'psid=not.is.null',
    'or=(status.is.null,status.eq.ACTIVE)',
  ]
  const url = `${supUrl}/rest/v1/survey_units?select=${encodeURIComponent('psid,route_seq,survey_id')}&${filterParts.join('&')}&order=route_seq.asc.nullslast`

  let freshUnits: any[]
  try {
    freshUnits = await fetchAllRows(url)
  } catch (e) {
    return { error: `Failed to fetch units: ${(e as Error).message}` }
  }

  const available = (freshUnits || []).filter((u) => u.psid && !excludePsids.has(u.psid)) as { psid: string; route_seq: number | null; survey_id: string | null }[]
  const toInsert = available.slice(0, deletedCount).map((u, i) => ({
    assignment_id: assignmentId,
    psid: u.psid,
    survey_id: u.survey_id,
    route_seq: u.route_seq || 0,
  }))

  if (!toInsert.length) return { data: assignment, items: [], inserted: 0 }

  const { data: newItems, error: ie } = await sup
    .from('assignment_items')
    .insert(toInsert)
    .select(ITEM_COLS)

  if (ie) return { error: ie.message }

  return { data: assignment, items: newItems || [], inserted: newItems?.length || 0 }
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
