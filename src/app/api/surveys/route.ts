import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentMonth } from '@/lib/constants'
import { chunkArray } from '@/lib/utils'
import type { SortField, SortDirection } from '@/types'

const COLS = 'survey_id, consumer_name, address, lat, lng, city_district, tehsil, uc_name, surveyor_name, survey_date, survey_time, monthly_fee, billing_category, status, psid, amount_due, arrears, route_name, route_seq, current_bill_month, image_urls'

function parseSort(sp: URLSearchParams): { field: string; ascending: boolean } {
  const field = sp.get('sortField') || 'consumer_name'
  const dir: SortDirection = sp.get('sortDirection') === 'asc' ? 'asc' : 'desc'
  const allowed: SortField[] = ['survey_id', 'surveyor_name', 'survey_date', 'survey_time']
  return { field: allowed.includes(field as SortField) ? field : 'consumer_name', ascending: dir === 'asc' }
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
  const sort = parseSort(sp)

  let q = sup.from('survey_units').select(COLS, { count: 'exact' }).eq('status', 'ACTIVE')
  if (districts.length) q = q.in('city_district', districts)
  if (tehsils.length) q = q.in('tehsil', tehsils)
  if (ucs.length) q = q.in('uc_name', ucs)
  if (surveyor) q = q.eq('surveyor_name', surveyor)
  if (search) q = q.or(`consumer_name.ilike.%${search}%,survey_id.ilike.%${search}%`)

  if (paymentStatus === 'all') {
    const { data, count, error } = await q.order(sort.field, { ascending: sort.ascending }).range(from, from + ps - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || [], total: count ?? 0 })
  }

  // Payment filter: fetch ALL matching psids in pages (avoids 1MB PostgREST limit)
  const PSID_PAGE = 3000
  let allPsids: string[] = []
  let psidOffset = 0
  while (true) {
    let pq = sup.from('survey_units').select('psid').eq('status', 'ACTIVE')
    if (districts.length) pq = pq.in('city_district', districts)
    if (tehsils.length) pq = pq.in('tehsil', tehsils)
    if (ucs.length) pq = pq.in('uc_name', ucs)
    if (surveyor) pq = pq.eq('surveyor_name', surveyor)
    if (search) pq = pq.or(`consumer_name.ilike.%${search}%,survey_id.ilike.%${search}%`)
    pq = pq.not('psid', 'is', null)

    const { data: rows } = await pq.range(psidOffset, psidOffset + PSID_PAGE - 1)
    if (!rows?.length) break
    const psids = rows.map((r: any) => r.psid).filter(Boolean)
    allPsids.push(...psids)
    if (psids.length < PSID_PAGE) break
    psidOffset += PSID_PAGE
  }

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
    .order(sort.field, { ascending: sort.ascending })

  return NextResponse.json({ data: pageData || [], total })
}
