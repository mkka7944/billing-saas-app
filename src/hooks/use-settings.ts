'use client'

import { useQuery } from '@tanstack/react-query'
import { STALE_TIMES } from '@/lib/queries/constants'

export interface AppSettings {
  [key: string]: any
  test_mode?: { enabled: boolean }
  map_zoom?: number
  unsent_mode?: { enabled: boolean }
  gps_enforcement?: { enforce: boolean; threshold: number }
  live_polling_enabled?: boolean
  live_poll_interval?: number
  notifications_polling_enabled?: boolean
  notifications_poll_interval?: number
}

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings')
      if (!res.ok) return {}
      return res.json()
    },
    staleTime: STALE_TIMES.REFERENCE,
  })
}
