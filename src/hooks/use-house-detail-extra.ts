'use client'

import { useQuery } from '@tanstack/react-query'
import type { BillInfo, SurveyUnit } from '@/types'
import type { DeliveryPhoto } from '@/hooks/use-delivery-photos'
import type { DrivePhoto } from '@/hooks/use-drive-photos'

interface FlaggedEntry {
  psid: string
  reason: string
  notes: string | null
}

interface FlaggedResponse {
  summary: { action: string; label: string; icon: string; plus_count: number } | null
  entries: FlaggedEntry[]
}

interface HouseDetailExtra {
  surveyData: SurveyUnit | null
  billData: { bill: any; payments: any[]; allMonths: string[]; latestArrears: number | null } | null
  billInfo: BillInfo | null
  deliveryPhotos: DeliveryPhoto[]
  drivePhotos: DrivePhoto[]
  flaggedData: FlaggedResponse
}

export function useHouseDetailExtra(surveyId: string | null, psid: string | null) {
  return useQuery<HouseDetailExtra>({
    queryKey: ['house-detail-extra', surveyId, psid],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (surveyId) params.set('survey_id', surveyId)
      if (psid) params.set('psid', psid)
      const res = await fetch(`/api/house-detail/extra?${params}`)
      if (!res.ok) throw new Error('Failed to fetch house detail extra')
      return res.json()
    },
    enabled: !!surveyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  })
}
