import type { SupabaseClient } from '@supabase/supabase-js'
import { applyActiveFilter } from '@/lib/queries/survey-units'

const COLS = 'survey_id, consumer_name, address, lat, lng, city_district, tehsil, uc_name, surveyor_name, survey_date, survey_time, monthly_fee, billing_category, status, psid, arrears, route_name, route_seq, current_bill_month, image_urls'
const MAP_COLS = 'survey_id, consumer_name, address, lat, lng, city_district, tehsil, uc_name, surveyor_name, survey_date, survey_time, monthly_fee, billing_category, status, psid, arrears, route_name, route_seq, current_bill_month, image_urls'

const BATCH_SIZE = 1000

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

function applyFilters(qb: any, q: SurveyQuery) {
  if (q.districts.length) qb = qb.in('city_district', q.districts)
  if (q.tehsils.length) qb = qb.in('tehsil', q.tehsils)
  if (q.ucs.length) qb = qb.in('uc_name', q.ucs)
  if (q.surveyor) qb = qb.eq('surveyor_name', q.surveyor)
  if (q.search) qb = qb.or(`consumer_name.ilike.%${q.search}%,survey_id.ilike.%${q.search}%,psid.ilike.%${q.search}%`)
  return qb
}

async function fetchAll(sup: SupabaseClient, q: SurveyQuery, baseQb: any): Promise<any[]> {
  const all: any[] = []
  const seen = new Set<string>()
  let offset = 0
  while (true) {
    const { data } = await baseQb
      .range(offset, offset + BATCH_SIZE - 1)
    if (!data?.length) break
    for (const row of data) {
      if (!seen.has(row.survey_id)) {
        seen.add(row.survey_id)
        all.push(row)
      }
    }
    if (data.length < BATCH_SIZE) break
    offset += BATCH_SIZE
  }
  return all
}

export async function getSurveyById(sup: SupabaseClient, id: string) {
  const { data, error } = await sup.from('survey_units').select(COLS).eq('survey_id', id).single()
  if (error) return { error: error.message }
  return { data: data || null }
}

export async function getSurveys(sup: SupabaseClient, q: SurveyQuery) {
  const from = (q.page - 1) * q.pageSize
  const useCols = q.pageSize > BATCH_SIZE ? MAP_COLS : COLS

  let qb = applyActiveFilter(sup.from('survey_units').select(useCols, { count: 'exact' }))
  qb = applyFilters(qb, q)

  if (q.paymentStatus === 'paid') qb = qb.eq('is_paid', true)
  else if (q.paymentStatus === 'unpaid') qb = qb.eq('is_paid', false)

  if (q.pageSize > BATCH_SIZE) {
    qb = qb.order('survey_id', { ascending: true })
    const data = await fetchAll(sup, q, qb)
    return { data, total: data.length }
  }

  const { data, count, error } = await qb
    .order(q.sort.field, { ascending: q.sort.ascending })
    .range(from, from + q.pageSize - 1)
  if (error) return { error: error.message }
  return { data: data || [], total: count ?? 0 }
}
