import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentMonth } from '@/lib/constants'
import { validateQuery } from '@/lib/validation/validate-query'
import { dataInsightSchema } from '@/lib/validation/schemas'
import { getDrillDownUnits } from '@/lib/repositories/data-insight-repository'

interface AggRow {
  level: 'district' | 'tehsil' | 'uc' | 'unit'
  district: string; tehsil?: string; uc_name?: string
  total_units: number; active: number
  billed: number; paid: number; collected: number
  surveyors: number; no_coords: number
}

export async function GET(request: Request) {
  try {
    const sup = await createClient()

    const params = validateQuery(request, dataInsightSchema)
    if (params instanceof NextResponse) return params

    const district = params.district
    const tehsil = params.tehsil
    const uc = params.uc
    const statusFilter = params.status
    const billMonth = params.billMonth || currentMonth()
    const page = params.page
    const ps = params.pageSize
    const sort = { field: params.sortField, ascending: params.sortDirection === 'asc' }
    const lvl: AggRow['level'] = !district ? 'district' : !tehsil ? 'tehsil' : 'uc'
    const dbStatus = statusFilter === 'archived' ? 'ARCHIVED' : statusFilter === 'active' ? 'ACTIVE' : ''
    const drillUC = params.drill || ''

    // Drill-down mode
    if (drillUC) {
      const drillResult = await getDrillDownUnits(sup, { billMonth, district, tehsil, drillUC, dbStatus, statusFilter, page, pageSize: ps, sort })

      if ('error' in drillResult) {
        return NextResponse.json({ error: drillResult.error }, { status: 500 })
      }

      return NextResponse.json({
        kpis: drillResult.kpis || { total_units: 0, active_units: 0, archived_units: 0, billed_units: 0, paid_units: 0, total_collected: 0, unique_surveyors: 0, no_coords: 0 },
        unitRows: drillResult.unitRows,
        rows: [],
        total: drillResult.total,
        level: 'unit',
      })
    }

    // Normal aggregation flow
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

    if (lvl === 'district') rows.sort((a, b) => b.total_units - a.total_units)
    else if (lvl === 'tehsil') rows.sort((a, b) => (a.tehsil ?? '').localeCompare(b.tehsil ?? ''))
    else if (lvl === 'uc') rows.sort((a, b) => {
      const aName = a.uc_name ?? ''
      const bName = b.uc_name ?? ''
      const aGroup = aName.startsWith('MC') ? 0 : aName.startsWith('UC') ? 1 : 2
      const bGroup = bName.startsWith('MC') ? 0 : bName.startsWith('UC') ? 1 : 2
      if (aGroup !== bGroup) return aGroup - bGroup
      const aN = parseInt(aName.match(/\d+/)?.[0] || '0', 10)
      const bN = parseInt(bName.match(/\d+/)?.[0] || '0', 10)
      return aN - bN
    })

    const totalRows = rows.length
    const pageRows = rows.slice((page - 1) * ps, (page - 1) * ps + ps)

    return NextResponse.json({
      kpis: r.kpis || { total_units: 0, active_units: 0, archived_units: 0, billed_units: 0, paid_units: 0, total_collected: 0, unique_surveyors: 0, no_coords: 0 },
      rows: pageRows,
      total: totalRows,
      level: lvl,
    })
  } catch (err) {
    console.error('data-insight route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
