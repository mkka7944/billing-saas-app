'use client'

import { useQuery, keepPreviousData } from '@tanstack/react-query'

export interface DeliveryPhoto {
  id: string
  assignment_item_id: string
  photo_url: string | null
  gdrive_file_id: string | null
  gps_lat: number | null
  gps_lng: number | null
  captured_at: string
  synced_to_drive: boolean
}

export function useDeliveryPhotos(psid: string | null) {
  return useQuery<DeliveryPhoto[]>({
    queryKey: ['delivery-photos', psid],
    queryFn: async () => {
      if (!psid) return []
      const res = await fetch(`/api/delivery/photos?psid=${encodeURIComponent(psid)}`)
      if (!res.ok) throw new Error('Failed to fetch delivery photos')
      const json = await res.json()
      return json.data || []
    },
    enabled: !!psid,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })
}
