'use client'

import { useQuery } from '@tanstack/react-query'

interface FlaggedEntry {
  psid: string
  reason: string
  notes: string | null
}

interface FlaggedResponse {
  summary: { action: string; label: string; icon: string; plus_count: number } | null
  entries: FlaggedEntry[]
}

export function useFlaggedPsids(surveyId: string | null, psid: string | null) {
  return useQuery<FlaggedResponse>({
    queryKey: ['flagged-psids', surveyId, psid],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (surveyId) params.set('survey_id', surveyId)
      if (psid) params.set('psid', psid)
      const res = await fetch(`/api/flagged-psids?${params}`)
      if (!res.ok) throw new Error('Failed to fetch flagged PSIDs')
      return res.json()
    },
    enabled: !!surveyId || !!psid,
    staleTime: 5 * 60 * 1000,
  })
}
