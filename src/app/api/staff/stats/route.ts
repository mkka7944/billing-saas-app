import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const sup = await createClient()

  const { data: { user }, error: authError } = await sup.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = new URL(request.url).searchParams
  const staffId = sp.get('staff_id') || ''
  const fromDate = sp.get('from') || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const toDate = sp.get('to') || new Date().toISOString().slice(0, 10)

  let q = sup
    .from('staff_daily_stats')
    .select('staff_id, assigned_date, total_assigned, delivered, missed')
    .gte('assigned_date', fromDate)
    .lte('assigned_date', toDate)

  if (staffId) q = q.eq('staff_id', staffId)
  q = q.order('assigned_date', { ascending: false })

  const { data: stats } = await q
  if (!stats?.length) {
    // Fallback: live aggregate from assignments + items
    let aq = sup
      .from('daily_assignments')
      .select('id, staff_id, issued_at, total_items')
      .gte('issued_at', fromDate)
      .lte('issued_at', toDate)
    if (staffId) aq = aq.eq('staff_id', staffId)

    const { data: assignments } = await aq
    if (!assignments?.length) {
      // Return per-staff stats with zeros
      const { data: staffList } = await sup
        .from('staff')
        .select('id, full_name')
        .eq('is_active', true)

      return NextResponse.json({
        data: (staffList || []).map((s) => ({
          staff_id: s.id,
          staff_name: s.full_name,
          total_assigned: 0,
          delivered: 0,
          missed: 0,
          pending: 0,
          rate: 0,
        })),
      })
    }

    const aIds = assignments.map((a: any) => a.id)
    const { data: items } = await sup
      .from('assignment_items')
      .select('assignment_id, status')
      .in('assignment_id', aIds)

    const itemCounts = new Map<string, { delivered: number; missed: number; processing: number; pending: number }>()
    for (const item of items || []) {
      const c = itemCounts.get(item.assignment_id) || { delivered: 0, missed: 0, processing: 0, pending: 0 }
      if (item.status === 'delivered') c.delivered++
      else if (item.status === 'missed') c.missed++
      else if (item.status === 'processing') c.processing++
      else c.pending++
      itemCounts.set(item.assignment_id, c)
    }

    const staffIds = [...new Set(assignments.map((a: any) => a.staff_id))]
    const { data: staffRows } = await sup
      .from('staff')
      .select('id, full_name')
      .in('id', staffIds)

    const staffNameMap = new Map((staffRows || []).map((s: any) => [s.id, s.full_name || 'Unknown']))
    const staffAgg = new Map<string, { total_assigned: number; delivered: number; missed: number; processing: number; pending: number }>()

    for (const a of assignments) {
      const ag = staffAgg.get(a.staff_id) || { total_assigned: 0, delivered: 0, missed: 0, processing: 0, pending: 0 }
      ag.total_assigned += a.total_items || 0
      const ic = itemCounts.get(a.id)
      if (ic) { ag.delivered += ic.delivered; ag.missed += ic.missed; ag.processing += ic.processing; ag.pending += ic.pending }
      staffAgg.set(a.staff_id, ag)
    }

    const data = Array.from(staffAgg.entries()).map(([sid, ag]) => ({
      staff_id: sid,
      staff_name: staffNameMap.get(sid) || 'Unknown',
      ...ag,
      rate: ag.total_assigned > 0 ? Math.round((ag.delivered / ag.total_assigned) * 100) : 0,
    }))

    return NextResponse.json({ data })
  }

  // Use pre-computed staff_daily_stats
  const staffIds = [...new Set(stats.map((s: any) => s.staff_id))]
  const { data: staffRows } = await sup
    .from('staff')
    .select('id, full_name')
    .in('id', staffIds)

  const staffNameMap = new Map((staffRows || []).map((s: any) => [s.id, s.full_name || 'Unknown']))

  const agg = new Map<string, { total_assigned: number; delivered: number; missed: number; processing: number }>()
  for (const s of stats) {
    const a = agg.get(s.staff_id) || { total_assigned: 0, delivered: 0, missed: 0, processing: 0 }
    a.total_assigned += s.total_assigned || 0
    a.delivered += s.delivered || 0
    a.missed += s.missed || 0
    a.processing += (s as any).processing || 0
    agg.set(s.staff_id, a)
  }

  const data = Array.from(agg.entries()).map(([sid, a]) => ({
    staff_id: sid,
    staff_name: staffNameMap.get(sid) || 'Unknown',
    total_assigned: a.total_assigned,
    delivered: a.delivered,
    missed: a.missed,
    processing: a.processing,
    pending: a.total_assigned - a.delivered - a.missed - a.processing,
    rate: a.total_assigned > 0 ? Math.round((a.delivered / a.total_assigned) * 100) : 0,
  }))

  return NextResponse.json({ data })
}
