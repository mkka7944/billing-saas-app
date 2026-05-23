import { createClient } from '@/lib/supabase/server'
import type { SurveyUnit } from '@/types'

export interface SurveyQueryParams {
  districts?: string[]
  tehsils?: string[]
  ucs?: string[]
  surveyor?: string | null
  search?: string | null
  paymentStatus?: string | null
  unitType?: string | null
  page: number
  pageSize: number
}

export async function getSurveys(params: SurveyQueryParams) {
  const supabase = await createClient()

  let query = supabase
    .from('survey_units')
    .select('survey_id, consumer_name, address, lat, lng, image_urls, city_district, tehsil, uc_name, uc_type, unit_type, surveyor_name, survey_date, monthly_fee, billing_category, status, category, sub_category, house_type', { count: 'exact' })
    .eq('status', 'ACTIVE')

  if (params.districts?.length) query = query.in('city_district', params.districts)
  if (params.tehsils?.length) query = query.in('tehsil', params.tehsils)
  if (params.ucs?.length) query = query.in('uc_name', params.ucs)
  if (params.surveyor) query = query.eq('surveyor_name', params.surveyor)
  if (params.unitType) query = query.eq('unit_type', params.unitType)
  if (params.search) {
    query = query.or(`consumer_name.ilike.%${params.search}%,survey_id.ilike.%${params.search}%`)
  }

  const from = (params.page - 1) * params.pageSize
  const to = from + params.pageSize - 1

  const { data, count, error } = await query
    .order('consumer_name', { ascending: true })
    .range(from, to)

  if (error) throw error

  return { data: data as SurveyUnit[], total: count ?? 0 }
}

export async function getSurveyById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('survey_units')
    .select('*')
    .eq('survey_id', id)
    .single()

  if (error) throw error
  return data as SurveyUnit
}
