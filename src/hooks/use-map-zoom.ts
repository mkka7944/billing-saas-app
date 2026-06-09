'use client'

import { useQuery } from '@tanstack/react-query'
import { STALE_TIMES } from '@/lib/queries/constants'

export function useMapZoom() {
  return useQuery<number>({
    queryKey: ['map-zoom'],
    queryFn: async () => {
      const res = await fetch('/api/settings')
      if (!res.ok) return 18
      const data = await res.json()
      const zoom = data?.map_zoom
      return typeof zoom === 'number' ? zoom : 18
    },
    staleTime: STALE_TIMES.REFERENCE,
  })
}
