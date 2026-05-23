'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface HierarchyOption {
  value: string
  label: string
  count: number
}

export interface HierarchyData {
  districts: HierarchyOption[]
  tehsils: Record<string, HierarchyOption[]>
  ucs: Record<string, HierarchyOption[]>
}

export function useHierarchy() {
  return useQuery({
    queryKey: ['filter-hierarchy'],
    queryFn: async (): Promise<HierarchyData> => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('survey_units')
        .select('city_district, tehsil, uc_name')
        .eq('status', 'ACTIVE')

      if (error) throw error

      const districtMap = new Map<string, number>()
      const tehsilMap = new Map<string, Map<string, number>>()
      const ucMap = new Map<string, Map<string, number>>()

      for (const row of data || []) {
        const dist = row.city_district || 'Unknown'
        const teh = row.tehsil || 'Unknown'
        const uc = row.uc_name || 'Unknown'

        districtMap.set(dist, (districtMap.get(dist) || 0) + 1)

        if (!tehsilMap.has(dist)) tehsilMap.set(dist, new Map())
        const tehGroup = tehsilMap.get(dist)!
        tehGroup.set(teh, (tehGroup.get(teh) || 0) + 1)

        const ucKey = `${dist}::${teh}`
        if (!ucMap.has(ucKey)) ucMap.set(ucKey, new Map())
        const ucGroup = ucMap.get(ucKey)!
        ucGroup.set(uc, (ucGroup.get(uc) || 0) + 1)
      }

      const districts: HierarchyOption[] = Array.from(districtMap.entries())
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => a.label.localeCompare(b.label))

      const tehsils: Record<string, HierarchyOption[]> = {}
      for (const [dist, tehGroup] of tehsilMap) {
        tehsils[dist] = Array.from(tehGroup.entries())
          .map(([value, count]) => ({ value, label: value, count }))
          .sort((a, b) => a.label.localeCompare(b.label))
      }

      const ucs: Record<string, HierarchyOption[]> = {}
      for (const [key, ucGroup] of ucMap) {
        ucs[key] = Array.from(ucGroup.entries())
          .map(([value, count]) => ({ value, label: value, count }))
          .sort((a, b) => a.label.localeCompare(b.label))
      }

      return { districts, tehsils, ucs } satisfies HierarchyData
    },
    staleTime: 30 * 60 * 1000,
  })
}

export function useSurveyors() {
  return useQuery({
    queryKey: ['surveyors'],
    queryFn: async (): Promise<string[]> => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('survey_units')
        .select('surveyor_name')
        .eq('status', 'ACTIVE')
        .not('surveyor_name', 'is', null)

      if (error) throw error

      const set = new Set<string>((data || []).map((r: { surveyor_name: string | null }) => r.surveyor_name).filter(Boolean))
      return [...set].sort()
    },
    staleTime: 30 * 60 * 1000,
  })
}
