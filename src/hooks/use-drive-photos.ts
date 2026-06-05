'use client'

import { useQuery } from '@tanstack/react-query'

export interface DrivePhoto {
  id: string
  photo_url: string
  thumbnail_url: string
  captured_at: string | null
}

export function useDrivePhotos(surveyId: string | null) {
  return useQuery<DrivePhoto[]>({
    queryKey: ['drive-photos', surveyId],
    queryFn: async () => {
      if (!surveyId) return []
      const res = await fetch(`/api/delivery/photos/drive?survey_id=${encodeURIComponent(surveyId)}`)
      if (!res.ok) throw new Error('Failed to fetch drive photos')
      const json = await res.json()
      return json.data || []
    },
    enabled: !!surveyId,
    staleTime: 5 * 60 * 1000,
  })
}
