import { createClient } from '@/lib/supabase/server'

interface Row {
  city_district: string | null
  tehsil: string | null
  uc_name: string | null
}

export interface HierarchyNode {
  label: string
  count: number
  children?: HierarchyNode[]
}

export async function getFilterHierarchy() {
  const supabase = await createClient()

  const { count } = await supabase
    .from('survey_units')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ACTIVE')

  const totalRows = count ?? 0
  const pageSize = 1000
  const totalPages = Math.ceil(totalRows / pageSize)

  const allRows: Row[] = []

  const fetchPage = async (page: number) => {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data } = await supabase
      .from('survey_units')
      .select('city_district, tehsil, uc_name')
      .eq('status', 'ACTIVE')
      .order('city_district')
      .order('tehsil')
      .order('uc_name')
      .range(from, to)
    if (data) allRows.push(...data)
  }

  const promises: Promise<void>[] = []
  for (let page = 0; page < totalPages; page++) {
    promises.push(fetchPage(page))
  }

  await Promise.all(promises)

  const seen = new Set<string>()
  const distinct: Row[] = []
  for (const row of allRows) {
    const key = `${row.city_district ?? ''}|${row.tehsil ?? ''}|${row.uc_name ?? ''}`
    if (!seen.has(key)) {
      seen.add(key)
      distinct.push(row)
    }
  }

  const hierarchy = new Map<string, Map<string, Map<string, number>>>()

  for (const row of distinct) {
    const district = row.city_district || 'Unknown'
    const tehsil = row.tehsil || 'Unknown'
    const uc = row.uc_name || 'Unknown'

    if (!hierarchy.has(district)) hierarchy.set(district, new Map())
    const tehsils = hierarchy.get(district)!

    if (!tehsils.has(tehsil)) tehsils.set(tehsil, new Map())
    const ucs = tehsils.get(tehsil)!

    ucs.set(uc, (ucs.get(uc) || 0) + 1)
  }

  return hierarchy
}

export async function getSurveyors() {
  const supabase = await createClient()

  const { count } = await supabase
    .from('survey_units')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ACTIVE')
    .not('surveyor_name', 'is', null)

  const totalRows = count ?? 0
  const pageSize = 1000
  const totalPages = Math.ceil(totalRows / pageSize)

  const allNames: string[] = []

  const fetchPage = async (page: number) => {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data } = await supabase
      .from('survey_units')
      .select('surveyor_name')
      .eq('status', 'ACTIVE')
      .not('surveyor_name', 'is', null)
      .order('surveyor_name')
      .range(from, to)
    if (data) allNames.push(...data.map((r) => r.surveyor_name).filter(Boolean))
  }

  const promises: Promise<void>[] = []
  for (let page = 0; page < totalPages; page++) {
    promises.push(fetchPage(page))
  }

  await Promise.all(promises)

  const surveyorSet = new Set(allNames)
  return [...surveyorSet].sort()
}
