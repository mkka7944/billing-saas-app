import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentMonth } from '@/lib/constants'

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

interface AggRow {
  level: 'district' | 'tehsil' | 'uc' | 'unit'
  district: string; tehsil?: string; uc_name?: string
  total_units: number; active: number
  billed: number; paid: number; collected: number
  surveyors: number; no_coords: number
}

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const district = sp.get('district') || ''
    const tehsil = sp.get('tehsil') || ''
    const uc = sp.get('uc') || ''
    const surveyor = sp.get('surveyor') || ''
    const statusParam = sp.get('status') || 'active'
    const billMonth = sp.get('billMonth') || currentMonth()
    const page = Math.max(1, parseInt(sp.get('page') || '1'))
    const ps = Math.min(100, Math.max(10, parseInt(sp.get('pageSize') || '50')))

    const sup = await createClient()
    const lvl: AggRow['level'] = !district ? 'district' : !tehsil ? 'tehsil' : 'uc'
    const dbStatus = statusParam === 'active' ? 'ACTIVE' : statusParam === 'archived' ? 'ARCHIVED' : null
    const drillUC = sp.get('drill') || ''

    // --- Delivery KPIS (independent queries, no psid dependency) ---
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)

    const { data: recentAssignments } = await sup
      .from('assignment_items')
      .select('id, status, assignment_id')
      .gte('delivered_at', ninetyDaysAgo)

    const assigned = recentAssignments || []
    const delivered = assigned.filter((a: any) => a.status === 'delivered')

    // Count photos for delivered items (chunked)
    const deliveredIds = delivered.map((a: any) => a.id)
    let totalPhotos = 0
    if (deliveredIds.length) {
      const photoResults = await Promise.all(
        chunkArray(deliveredIds, 800).map(chunk =>
          sup.from('delivery_photos').select('id', { count: 'exact', head: true }).in('assignment_item_id', chunk)
        )
      )
      totalPhotos = photoResults.reduce((s, r) => s + (r.count || 0), 0)
    }

    // Count distinct staff for these assignments
    const assignmentIds = [...new Set(assigned.map((a: any) => a.assignment_id).filter(Boolean))]
    let staffCount = 0
    if (assignmentIds.length) {
      const { data: staffData } = await sup
        .from('daily_assignments')
        .select('staff_id')
        .in('id', assignmentIds)
      staffCount = staffData ? new Set(staffData.map((s: any) => s.staff_id)).size : 0
    }

    const deliveryKpis = {
      total_assigned: assigned.length,
      total_delivered: delivered.length,
      delivery_rate: assigned.length > 0 ? Math.round((delivered.length / assigned.length) * 100) : 0,
      total_photos: totalPhotos,
      staff_with_deliveries: staffCount,
    }

    // --- Drill-down mode: unit-level data ---
    if (drillUC) {
      const { data: raw, error: rpcErr } = await sup.rpc('get_hierarchy_stats', {
        p_month: billMonth,
        p_district: district,
        p_tehsil: tehsil,
        p_uc: drillUC,
        p_status: dbStatus || '',
      })

      if (rpcErr) {
        console.error('get_hierarchy_stats RPC error:', rpcErr)
        return NextResponse.json({ error: rpcErr.message }, { status: 500 })
      }

      const r = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
        kpis?: Record<string, number>
      } | null

      let unitQuery = sup
        .from('survey_units')
        .select('survey_id, psid, consumer_name, status, amount_due, surveyor_name, monthly_fee, arrears', { count: 'exact' })
        .eq('uc_name', drillUC)
        .eq('status', dbStatus || 'ACTIVE')

      if (district) unitQuery = unitQuery.eq('city_district', district)
      if (tehsil) unitQuery = unitQuery.eq('tehsil', tehsil)

      const { data: units, count: unitTotal, error: unitErr } = await unitQuery
        .order('psid')
        .range((page - 1) * ps, (page - 1) * ps + ps - 1)

      if (unitErr) {
        console.error('Drill-down query error:', unitErr)
        return NextResponse.json({ error: unitErr.message }, { status: 500 })
      }

      let unitRows: {
        survey_id: string; psid: string; consumer_name: string | null; status: string
        amount_due: number; surveyor_name: string | null; amount_paid: number
        monthly_fee: number; arrears: number
      }[] = (units || []).map(u => ({
        survey_id: u.survey_id,
        psid: u.psid,
        consumer_name: u.consumer_name,
        status: u.status,
        amount_due: u.amount_due,
        surveyor_name: u.surveyor_name,
        amount_paid: 0,
        monthly_fee: u.monthly_fee ?? 0,
        arrears: u.arrears ?? 0,
      }))

      const psids = (units || []).map(u => u.psid)
      if (psids.length) {
        const { data: payments } = await sup
          .from('payment_history')
          .select('psid, amount_paid')
          .eq('bill_month', billMonth)
          .eq('payment_status', 'paid')
          .in('psid', psids)

        const paymentMap = new Map((payments || []).map(p => [p.psid, p.amount_paid ?? 0]))
        unitRows = unitRows.map(u => ({ ...u, amount_paid: paymentMap.get(u.psid) || 0 }))
      }

      return NextResponse.json({
        kpis: r?.kpis || {
          total_units: 0, active_units: 0, archived_units: 0, billed_units: 0,
          paid_units: 0, total_collected: 0, unique_surveyors: 0, no_coords: 0,
        },
        delivery_kpis: deliveryKpis,
        unitRows,
        rows: [],
        total: unitTotal || 0,
        level: 'unit',
      })
    }

    // --- Normal aggregation flow ---
    const { data: raw, error: rpcErr } = await sup.rpc('get_hierarchy_stats', {
      p_month: billMonth,
      p_district: district,
      p_tehsil: tehsil,
      p_uc: uc,
      p_status: dbStatus || '',
    })

    if (rpcErr) {
      console.error('get_hierarchy_stats RPC error:', rpcErr)
      return NextResponse.json({ error: rpcErr.message }, { status: 500 })
    }

    const r = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
      kpis?: Record<string, number>
      rows?: { gk: string; total_units: number; active: number; billed: number; paid: number; collected: number; surveyors: number; no_coords: number }[]
    } | null

    if (!r?.rows?.length) {
      return NextResponse.json({
        kpis: { total_units: 0, active_units: 0, archived_units: 0, billed_units: 0, paid_units: 0, total_collected: 0, unique_surveyors: 0, no_coords: 0 },
        delivery_kpis: { total_delivered: 0, total_assigned: 0, delivery_rate: 0, total_photos: 0, staff_with_deliveries: 0 },
        rows: [], total: 0, level: lvl,
      })
    }

    const rows: AggRow[] = r.rows.map((g) => {
      const base: AggRow = {
        level: lvl,
        district: lvl === 'district' ? g.gk : district || 'Unknown',
        ...(lvl === 'tehsil' || lvl === 'uc' ? { tehsil: lvl === 'tehsil' ? g.gk : tehsil } : {}),
        ...(lvl === 'uc' ? { uc_name: g.gk } : {}),
        total_units: g.total_units,
        active: g.active,
        billed: g.billed,
        paid: g.paid,
        collected: Number(g.collected),
        surveyors: g.surveyors,
        no_coords: g.no_coords,
      }
      return base
    })

    // --- Sorting ---
    if (lvl === 'district') rows.sort((a, b) => b.total_units - a.total_units)
    else if (lvl === 'tehsil') rows.sort((a, b) => (a.tehsil ?? '').localeCompare(b.tehsil ?? ''))
    else if (lvl === 'uc') rows.sort((a, b) => {
      const aN = parseInt((a.uc_name ?? '').replace(/\D/g, ''), 10) || 0
      const bN = parseInt((b.uc_name ?? '').replace(/\D/g, ''), 10) || 0
      return aN - bN
    })

    const totalRows = rows.length
    const pageRows = rows.slice((page - 1) * ps, (page - 1) * ps + ps)

    return NextResponse.json({
      kpis: r.kpis || {
        total_units: 0, active_units: 0, archived_units: 0, billed_units: 0,
        paid_units: 0, total_collected: 0, unique_surveyors: 0, no_coords: 0,
      },
      delivery_kpis: deliveryKpis,
      rows: pageRows,
      total: totalRows,
      level: lvl,
    })
  } catch (err) {
    console.error('data-insight route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
