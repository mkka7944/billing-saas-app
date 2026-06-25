'use client'

import { useQuery } from '@tanstack/react-query'
import { useBillingStore } from '@/stores/billing-store'
import { useLiveStore } from '@/stores/live-store'
import { useSettings } from '@/hooks/use-settings'

export interface StaffPosition {
  staff_id: string
  staff_name: string
  lat: number
  lng: number
  accuracy: number | null
  last_seen: string
  is_active: boolean
}

interface StaffPositionsResponse {
  positions: StaffPosition[]
}

export function useStaffPositions() {
  const activeView = useBillingStore((s) => s.activeView)
  const selectedCity = useLiveStore((s) => s.selectedCity)
  const staffGpsVisible = useLiveStore((s) => s.staffGpsVisible)
  const { data: settings } = useSettings()
  const hasVisibleStaff = staffGpsVisible.size > 0
  const enabled = activeView === 'live' && hasVisibleStaff && !!selectedCity
  const pollInterval = (settings?.live_poll_interval || 60) * 1000

  return useQuery<StaffPosition[]>({
    queryKey: ['staff-positions', selectedCity],
    queryFn: async () => {
      const params = new URLSearchParams({ city: selectedCity })
      const res = await fetch(`/api/live/staff-positions?${params}`)
      if (!res.ok) return []
      const data: StaffPositionsResponse = await res.json()
      return data.positions || []
    },
    refetchInterval: enabled ? pollInterval : false,
    staleTime: Math.max(pollInterval - 5000, 5000),
    enabled,
    // Only return positions for staff whose GPS is toggled on
    select: (positions) => positions.filter((p) => staffGpsVisible.has(p.staff_id)),
  })
}
