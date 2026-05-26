import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentMonth, today } from '@/lib/constants'

const ASSIGNMENT_COLS = 'id, staff_id, assigned_date, uc_name, total_items, created_by, created_at'
const ITEM_COLS = 'id, assignment_id, psid, route_seq, status, delivered_at, gps_lat, gps_lng, notes'
const PSID_COLS = 'survey_id, consumer_name, address, lat, lng, psid, amount_due, route_seq, route_name'

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const uc = sp.get('uc')
  const staffId = sp.get('staff_id')
  const totals = sp.get('totals') === 'true'
  const list = sp.get('list') === 'true'
  const date = sp.get('date') || today()
  const month = sp.get('month') || currentMonth()
  const sup = await createClient()

  // Mode 1: Get unassigned counts per UC (for overview)
  if (totals) {
    const { data: allAssignments } = await sup
      .from('daily_assignments')
      .select('id, uc_name')
      .eq('assigned_date', date)

    const allIds = allAssignments?.map((a: any) => a.id) || []
    const { data: allItems } = allIds.length
      ? await sup.from('assignment_items').select('psid').in('assignment_id', allIds)
      : { data: [] }

    const assignedPsids = new Set((allItems || []).map((i: any) => i.psid))

    const { data: units } = await sup
      .from('survey_units')
      .select('uc_name, psid')
      .eq('status', 'ACTIVE')
      .eq('current_bill_month', month)
      .not('psid', 'is', null)
      .range(0, 1_000_000)

    const counts = new Map<string, { total: number; assigned: number }>()
    for (const u of units || []) {
      const c = counts.get(u.uc_name) || { total: 0, assigned: 0 }
      c.total++
      if (assignedPsids.has(u.psid)) c.assigned++
      counts.set(u.uc_name, c)
    }

    const data = Array.from(counts.entries())
      .map(([uc_name, c]) => ({ uc_name, total: c.total, assigned: c.assigned, unassigned: c.total - c.assigned }))
      .sort((a, b) => a.uc_name.localeCompare(b.uc_name))

    return NextResponse.json({ data })
  }

  // Mode 2: List all assignments for a date with stats
  if (list) {
    const { data: assignments } = await sup
      .from('daily_assignments')
      .select(ASSIGNMENT_COLS)
      .eq('assigned_date', date)
      .order('created_at', { ascending: false })

    if (!assignments?.length) return NextResponse.json({ data: [] })

    // Get staff names
    const staffIds = [...new Set(assignments.map((a: any) => a.staff_id))]
    const { data: staffRows } = await sup
      .from('staff')
      .select('id, full_name')
      .in('id', staffIds)

    const staffNameMap = new Map((staffRows || []).map((s: any) => [s.id, s.full_name || 'Unknown']))

    // Get item status counts per assignment
    const assignmentIds = assignments.map((a: any) => a.id)
    const { data: allItems } = await sup
      .from('assignment_items')
      .select('assignment_id, status')
      .in('assignment_id', assignmentIds)

    const itemCounts = new Map<string, { pending: number; delivered: number; missed: number }>()
    for (const item of allItems || []) {
      const c = itemCounts.get(item.assignment_id) || { pending: 0, delivered: 0, missed: 0 }
      c[item.status as keyof typeof c]++
      itemCounts.set(item.assignment_id, c)
    }

    const data = assignments.map((a: any) => {
      const counts = itemCounts.get(a.id) || { pending: 0, delivered: 0, missed: 0 }
      const completed = counts.delivered + counts.missed
      return {
        id: a.id,
        staff_id: a.staff_id,
        staff_name: staffNameMap.get(a.staff_id) || 'Unknown',
        assigned_date: a.assigned_date,
        uc_name: a.uc_name,
        total_items: a.total_items,
        ...counts,
        completion_pct: a.total_items > 0 ? Math.round((completed / a.total_items) * 100) : 0,
        created_at: a.created_at,
      }
    })

    return NextResponse.json({ data })
  }

  // Mode 3: Get unassigned PSIDs in a UC
  if (uc) {
    const { data: existingAssignments } = await sup
      .from('daily_assignments')
      .select('id')
      .eq('assigned_date', date)
      .eq('uc_name', uc)

    const existingIds = existingAssignments?.map((a: any) => a.id) || []
    const excludePsids = new Set<string>()
    if (existingIds.length) {
      const { data: existingItems } = await sup
        .from('assignment_items')
        .select('psid')
        .in('assignment_id', existingIds)
      for (const e of existingItems || []) excludePsids.add(e.psid)
    }

    let q = sup
      .from('survey_units')
      .select(PSID_COLS)
      .eq('status', 'ACTIVE')
      .eq('current_bill_month', month)
      .eq('uc_name', uc)
      .not('psid', 'is', null)

    const { data, error } = await q.order('route_seq', { ascending: true, nullsFirst: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const unassigned = (data || []).filter((s: any) => !excludePsids.has(s.psid))
    return NextResponse.json({ data: unassigned, total: unassigned.length })
  }

  // Mode 4: Get staff's daily assignment + items (with survey unit data)
  if (staffId) {
    const { data: assignment, error: ae } = await sup
      .from('daily_assignments')
      .select(ASSIGNMENT_COLS)
      .eq('staff_id', staffId)
      .eq('assigned_date', date)
      .maybeSingle()

    if (ae) return NextResponse.json({ error: ae.message }, { status: 500 })

    if (!assignment) {
      return NextResponse.json({ data: null, items: [] })
    }

    const { data: items, error: ie } = await sup
      .from('assignment_items')
      .select(ITEM_COLS)
      .eq('assignment_id', assignment.id)
      .order('route_seq', { ascending: true, nullsFirst: false })

    if (ie) return NextResponse.json({ error: ie.message }, { status: 500 })

    const psids = (items || []).map((i) => i.psid)
    const { data: units } = psids.length
      ? await sup
          .from('survey_units')
          .select('psid, consumer_name, address, lat, lng, amount_due, monthly_fee, route_name, route_seq, uc_name')
          .in('psid', psids)
      : { data: [] }

    const unitMap = new Map((units || []).map((u) => [u.psid, u]))
    const itemsWithUnits = (items || []).map((item) => ({
      ...item,
      unit: unitMap.get(item.psid) || null,
    }))

    return NextResponse.json({ data: assignment, items: itemsWithUnits })
  }

  return NextResponse.json({ error: 'Provide uc=, staff_id=, list=true or totals=true' }, { status: 400 })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { staff_id, assigned_date, uc_name, psids } = body as {
    staff_id: string
    assigned_date: string
    uc_name: string
    psids: string[]
  }

  if (!staff_id || !assigned_date || !uc_name || !psids?.length) {
    return NextResponse.json({ error: 'staff_id, assigned_date, uc_name, and psids[] required' }, { status: 400 })
  }

  const sup = await createClient()

  const { data: existing } = await sup
    .from('daily_assignments')
    .select('id')
    .eq('staff_id', staff_id)
    .eq('assigned_date', assigned_date)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Staff already has an assignment for this date' }, { status: 409 })
  }

  const { data: units } = await sup
    .from('survey_units')
    .select('psid, route_seq')
    .in('psid', psids)

  const seqMap = new Map((units || []).map((u: any) => [u.psid, u.route_seq || 0]))

  const { data: assignment, error: ae } = await sup
    .from('daily_assignments')
    .insert({ staff_id, assigned_date, uc_name, total_items: psids.length })
    .select(ASSIGNMENT_COLS)
    .single()

  if (ae) return NextResponse.json({ error: ae.message }, { status: 500 })

  const items = psids.map((psid) => ({
    assignment_id: assignment.id,
    psid,
    route_seq: seqMap.get(psid) || 0,
  }))

  const { data: createdItems, error: ie } = await sup
    .from('assignment_items')
    .insert(items)
    .select(ITEM_COLS)

  if (ie) {
    await sup.from('daily_assignments').delete().eq('id', assignment.id)
    return NextResponse.json({ error: ie.message }, { status: 500 })
  }

  return NextResponse.json({ data: assignment, items: createdItems || [] }, { status: 201 })
}

export async function DELETE(request: Request) {
  const sp = new URL(request.url).searchParams
  const id = sp.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 })
  }

  const sup = await createClient()

  const { data: assignment, error: fe } = await sup
    .from('daily_assignments')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (fe) return NextResponse.json({ error: fe.message }, { status: 500 })
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  const { error: de } = await sup.from('daily_assignments').delete().eq('id', id)
  if (de) return NextResponse.json({ error: de.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
