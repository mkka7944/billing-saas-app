import type { SupabaseClient } from '@supabase/supabase-js'
import { applyActiveFilter } from '@/lib/queries/survey-units'
import { chunkArray } from '@/lib/utils'

const COLS = 'survey_id, consumer_name, address, lat, lng, city_district, tehsil, uc_name, surveyor_name, survey_date, survey_time, monthly_fee, billing_category, status, psid, arrears, route_name, route_seq, current_bill_month, image_urls'

export interface SurveyQuery {
  districts: string[]
  tehsils: string[]
  ucs: string[]
  surveyor: string
  search: string
  paymentStatus: 'all' | 'paid' | 'unpaid'
  billMonth: string
  page: number
  pageSize: number
  sort: { field: string; ascending: boolean }
}

export async function getSurveyById(sup: SupabaseClient, id: string) {
  const { data, error } = await sup.from('survey_units').select(COLS).eq('survey_id', id).single()
  if (error) return { error: error.message }
  return { data: data || null }
}

export async function getSurveys(sup: SupabaseClient, q: SurveyQuery) {
  const from = (q.page - 1) * q.pageSize

  let qb = applyActiveFilter(sup.from('survey_units').select(COLS, { count: 'exact' }))
  if (q.districts.length) qb = qb.in('city_district', q.districts)
  if (q.tehsils.length) qb = qb.in('tehsil', q.tehsils)
  if (q.ucs.length) qb = qb.in('uc_name', q.ucs)
  if (q.surveyor) qb = qb.eq('surveyor_name', q.surveyor)
  if (q.search) qb = qb.or(`consumer_name.ilike.%${q.search}%,survey_id.ilike.%${q.search}%`)

  if (q.paymentStatus === 'all') {
    const { data, count, error } = await qb
      .order(q.sort.field, { ascending: q.sort.ascending })
      .range(from, from + q.pageSize - 1)
    if (error) return { error: error.message }
    return { data: data || [], total: count ?? 0 }
  }

  // Payment filter: fetch ALL matching PSIDs in pages
  const PSID_PAGE = 3000
  let allPsids: string[] = []
  let psidOffset = 0
  while (true) {
    let pq = applyActiveFilter(sup.from('survey_units').select('psid'))
    if (q.districts.length) pq = pq.in('city_district', q.districts)
    if (q.tehsils.length) pq = pq.in('tehsil', q.tehsils)
    if (q.ucs.length) pq = pq.in('uc_name', q.ucs)
    if (q.surveyor) pq = pq.eq('surveyor_name', q.surveyor)
    if (q.search) pq = pq.or(`consumer_name.ilike.%${q.search}%,survey_id.ilike.%${q.search}%`)
    pq = pq.not('psid', 'is', null)

    const { data: rows } = await pq.range(psidOffset, psidOffset + PSID_PAGE - 1)
    if (!rows?.length) break
    const psids = rows.map((r: any) => r.psid).filter(Boolean)
    allPsids.push(...psids)
    if (psids.length < PSID_PAGE) break
    psidOffset += PSID_PAGE
  }

  const paidPsids = new Set<string>()
  if (allPsids.length) {
    const chunks = chunkArray(allPsids, 800)
    const results = await Promise.all(
      chunks.map((chunk) =>
        sup
          .from('payment_history')
          .select('psid')
          .eq('bill_month', q.billMonth)
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
    return q.paymentStatus === 'paid' ? isPaid : !isPaid
  })

  const total = filteredPsids.length
  const pagePsids = filteredPsids.slice(from, from + q.pageSize)

  if (!pagePsids.length) return { data: [], total }

  const { data: pageData } = await sup
    .from('survey_units')
    .select(COLS)
    .in('psid', pagePsids)
    .order(q.sort.field, { ascending: q.sort.ascending })

  return { data: pageData || [], total }
}
