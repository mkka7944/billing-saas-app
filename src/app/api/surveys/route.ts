import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function currentMonth(): string {
  const m = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const d = new Date()
  return `${m[d.getMonth()]}${d.getFullYear()}`
}

const COLS = 'survey_id, consumer_name, address, lat, lng, image_urls, city_district, tehsil, uc_name, uc_type, unit_type, surveyor_name, survey_date, monthly_fee, billing_category, status, category, sub_category, house_type'

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const id = sp.get('id')
  const sup = await createClient()

  // Single survey lookup by ID
  if (id) {
    const { data, error } = await sup.from('survey_units').select(COLS).eq('survey_id', id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || null })
  }

  const districts = sp.getAll('district')
  const tehsils = sp.getAll('tehsil')
  const ucs = sp.getAll('uc')
  const surveyor = sp.get('surveyor') || ''
  const unitType = sp.get('unitType') || ''
  const search = sp.get('search') || ''
  const paymentStatus = sp.get('paymentStatus') || 'all'
  const billMonth = sp.get('billMonth') || currentMonth()
  const page = Math.max(1, parseInt(sp.get('page') || '1'))
  const ps = Math.min(100, Math.max(10, parseInt(sp.get('pageSize') || '50')))

  const from = (page - 1) * ps

  let q = sup.from('survey_units').select(COLS, { count: 'exact' }).eq('status', 'ACTIVE')
  if (districts.length) q = q.in('city_district', districts)
  if (tehsils.length) q = q.in('tehsil', tehsils)
  if (ucs.length) q = q.in('uc_name', ucs)
  if (surveyor) q = q.eq('surveyor_name', surveyor)
  if (unitType) q = q.eq('unit_type', unitType)
  if (search) q = q.or(`consumer_name.ilike.%${search}%,survey_id.ilike.%${search}%`)

  if (paymentStatus === 'all') {
    const { data, count, error } = await q.order('consumer_name').range(from, from + ps - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || [], total: count ?? 0 })
  }

  // Payment filter active — fetch page + check payment status server-side
  const { data, count, error } = await q.order('consumer_name').range(from, from + ps - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ data: [], total: 0 })

  const surveyIds = data.map((s: any) => s.survey_id)

  // psid↔survey_id is stable — any month's mapping works
  const { data: items } = await sup
    .from('bill_items')
    .select('psid, survey_id')
    .in('survey_id', surveyIds)

  const psids = [...new Set((items || []).map((i: any) => i.psid))]
  const paidSet = new Set<string>()
  if (psids.length) {
    const { data: paidRows } = await sup
      .from('payment_history')
      .select('psid')
      .eq('bill_month', billMonth)
      .eq('payment_status', 'paid')
      .in('psid', psids)
    for (const p of paidRows || []) paidSet.add(p.psid)
  }

  const surveyPaid = new Set<string>()
  for (const bi of items || []) {
    if (paidSet.has(bi.psid)) surveyPaid.add(bi.survey_id)
  }

  const filtered = data.filter((s: any) => {
    const isPaid = surveyPaid.has(s.survey_id)
    if (paymentStatus === 'paid') return isPaid
    return !isPaid // unpaid / overdue
  })

  return NextResponse.json({ data: filtered, total: count ?? 0 })
}
