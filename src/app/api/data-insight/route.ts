import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function currentMonth(): string {
  const m = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const d = new Date()
  return `${m[d.getMonth()]}${d.getFullYear()}`
}

interface AggRow {
  level: 'district' | 'tehsil' | 'uc' | 'unit'
  district: string; tehsil?: string; uc_name?: string
  total_units: number; active: number
  billed: number; paid: number; collected: number
  surveyors: number; no_coords: number
}

interface RpcSurveyRow { group_key: string; total_units: number; active_units: number; no_coords: number; surveyor_count: number }
interface RpcBillingRow { group_key: string; billed_units: number; paid_units: number; total_collected: number }

function kmeta(k: string, lvl: string) {
  if (lvl === 'district') return { district: k }
  const p = k.split('::')
  if (lvl === 'tehsil') return { district: p[0], tehsil: p[1] }
  return { district: p[0], tehsil: p[1], uc_name: p[2] ?? k }
}

export async function GET(request: Request) {
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
  const dbStatus = statusParam === 'active' ? 'ACTIVE' : statusParam === 'archived' ? 'ARCHIVED' : null
  const lvl: AggRow['level'] = !district ? 'district' : !tehsil ? 'tehsil' : 'uc'

  // Pass null for empty params, non-null for set params
  const pDist = district || null
  const pTeh = tehsil || null
  const pUc = uc || null
  const pSurv = surveyor || null

  const [surveyRes, billingRes] = await Promise.all([
    sup.rpc('get_survey_group_stats', { p_city_district: pDist, p_tehsil: pTeh, p_uc: pUc, p_surveyor: pSurv, p_status: dbStatus }),
    sup.rpc('get_billing_group_stats', { p_city_district: pDist, p_tehsil: pTeh, p_uc: pUc, p_bill_month: billMonth }),
  ])

  if (surveyRes.error) throw new Error(`survey RPC: ${surveyRes.error.message}`)
  if (billingRes.error) throw new Error(`billing RPC: ${billingRes.error.message}`)

  const surveyRows = (surveyRes.data || []) as RpcSurveyRow[]
  const billingRows = (billingRes.data || []) as RpcBillingRow[]
  const billingMap = new Map(billingRows.map(r => [r.group_key, r]))

  const rows: AggRow[] = surveyRows.map(r => {
    const b = billingMap.get(r.group_key)
    const m = kmeta(r.group_key, lvl)
    return {
      level: lvl,
      district: m.district || 'Unknown',
      ...(lvl !== 'district' ? { tehsil: m.tehsil ?? 'Unknown' } : {}),
      ...(lvl === 'uc' ? { uc_name: m.uc_name ?? r.group_key } : {}),
      total_units: Number(r.total_units),
      active: Number(r.active_units),
      billed: b ? Number(b.billed_units) : 0,
      paid: b ? Number(b.paid_units) : 0,
      collected: b ? Number(b.total_collected) : 0,
      surveyors: Number(r.surveyor_count),
      no_coords: Number(r.no_coords),
    }
  })

  const kpis = {
    total_units: rows.reduce((s, r) => s + r.total_units, 0),
    active_units: rows.reduce((s, r) => s + r.active, 0),
    archived_units: rows.reduce((s, r) => s + r.total_units - r.active, 0),
    billed_units: rows.reduce((s, r) => s + r.billed, 0),
    paid_units: rows.reduce((s, r) => s + r.paid, 0),
    total_collected: rows.reduce((s, r) => s + r.collected, 0),
    unique_surveyors: rows.reduce((s, r) => s + r.surveyors, 0),
    no_coords: rows.reduce((s, r) => s + r.no_coords, 0),
  }

  if (lvl === 'district') rows.sort((a, b) => b.total_units - a.total_units)
  else if (lvl === 'tehsil') rows.sort((a, b) => (a.tehsil ?? '').localeCompare(b.tehsil ?? ''))
  else if (lvl === 'uc') rows.sort((a, b) => (a.uc_name ?? '').localeCompare(b.uc_name ?? ''))

  const totalRows = rows.length
  const pageRows = rows.slice((page - 1) * ps, (page - 1) * ps + ps)

  return NextResponse.json({ kpis, rows: pageRows, total: totalRows })
}
