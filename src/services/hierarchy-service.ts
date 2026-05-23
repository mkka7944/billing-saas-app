import { createClient } from '@/lib/supabase/server'

export interface HierarchyNode {
  label: string
  count: number
  children?: HierarchyNode[]
}

export async function getFilterHierarchy() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('survey_units')
    .select('city_district, tehsil, uc_name')
    .eq('status', 'ACTIVE')

  if (error) throw error

  const hierarchy = new Map<string, Map<string, Map<string, number>>>()

  for (const row of data || []) {
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

  const { data, error } = await supabase
    .from('survey_units')
    .select('surveyor_name')
    .eq('status', 'ACTIVE')
    .not('surveyor_name', 'is', null)

  if (error) throw error

  const surveyorSet = new Set((data || []).map((r) => r.surveyor_name).filter(Boolean))
  return [...surveyorSet].sort()
}
