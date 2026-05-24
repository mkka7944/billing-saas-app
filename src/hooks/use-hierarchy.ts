'use client'

import { useQuery } from '@tanstack/react-query'

export interface HierarchyOption {
  value: string
  label: string
  count: number
}

export interface HierarchyData {
  districts: HierarchyOption[]
  tehsils: Record<string, HierarchyOption[]>
  ucs: Record<string, HierarchyOption[]>
  surveyors: string[]
}

export function useHierarchy() {
  return useQuery({
    queryKey: ['filter-hierarchy'],
    queryFn: async (): Promise<HierarchyData> => {
      const res = await fetch('/api/hierarchy')
      if (!res.ok) throw new Error('Failed to fetch hierarchy')
      const data = await res.json()
      return {
        districts: data.districts || [],
        tehsils: data.tehsils || {},
        ucs: data.ucs || {},
        surveyors: data.surveyors || [],
      }
    },
    staleTime: 30 * 60 * 1000,
  })
}
