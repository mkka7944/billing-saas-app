import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentMonth } from '@/lib/constants'

const COLS = 'survey_id, consumer_name, address, lat, lng, city_district, tehsil, uc_name, surveyor_name, survey_date, survey_time, monthly_fee, billing_category, status, psid, amount_due, arrears, route_name, route_seq, current_bill_month, image_urls'

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const id = sp.get('id')
  const sup = await createClient()

  if (id) {
    const { data, error } = await sup.from('survey_units').select(COLS).eq('survey_id', id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || null })
  }

  const districts = sp.getAll('district')
  const tehsils = sp.getAll('tehsil')
  const ucs = sp.getAll('uc')
  const surveyor = sp.get('surveyor') || ''
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
  if (search) q = q.or(`consumer_name.ilike.%${search}%,survey_id.ilike.%${search}%`)

  if (paymentStatus === 'all') {
    const { data, count, error } = await q.order('consumer_name').range(from, from + ps - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || [], total: count ?? 0 })
  }

  // Payment filter: get ALL matching psids via paginated fetches
  let idQ = sup.from('survey_units').select('psid').eq('status', 'ACTIVE')
  if (districts.length) idQ = idQ.in('city_district', districts)
  if (tehsils.length) idQ = idQ.in('tehsil', tehsils)
  if (ucs.length) idQ = idQ.in('uc_name', ucs)
  if (surveyor) idQ = idQ.eq('surveyor_name', surveyor)
  if (search) idQ = idQ.or(`consumer_name.ilike.%${search}%,survey_id.ilike.%${search}%`)
  idQ = idQ.not('psid', 'is', null).range(0, 1_000_000)

  const { data: allRows } = await idQ
  const allPsids = (allRows || []).map((r: any) => r.psid).filter(Boolean)

  // Chunk psids to avoid URL length limits
  const paidPsids = new Set<string>()
  if (allPsids.length) {
    const chunks = chunkArray(allPsids, 800)
    const results = await Promise.all(
      chunks.map((chunk) =>
        sup
          .from('payment_history')
          .select('psid')
          .eq('bill_month', billMonth)
          .eq('payment_status', 'paid')
          .in('psid', chunk)
      )
    )
    for (const { data } of results) {
      for (const p of data || []) paidPsids.add(p.psid)
    }
  }

  const filteredPsids = allPsids.filter((psid: string) => {
    const isPaid = paidPsids.has(psid)
    return paymentStatus === 'paid' ? isPaid : !isPaid
  })

  const total = filteredPsids.length
  const pagePsids = filteredPsids.slice(from, from + ps)

  if (!pagePsids.length) {
    return NextResponse.json({ data: [], total })
  }

  const { data: pageData } = await sup
    .from('survey_units')
    .select(COLS)
    .in('psid', pagePsids)
    .order('consumer_name')

  return NextResponse.json({ data: pageData || [], total })
}
