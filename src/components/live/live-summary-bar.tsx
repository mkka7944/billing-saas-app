'use client'

import { useMemo } from 'react'
import { useDeliveryTrail } from '@/hooks/use-delivery-trail'
import { useLiveStore } from '@/stores/live-store'
import { pktToday } from '@/lib/pkt'

export function LiveSummaryBar() {
  const selectedCity = useLiveStore((s) => s.selectedCity)
  const selectedDate = useLiveStore((s) => s.selectedDate)
  const { data } = useDeliveryTrail(selectedCity, selectedDate !== pktToday() ? selectedDate : null)

  const stats = useMemo(() => {
    const markers = data?.markers || []
    const delivered = markers.filter((m) => m.status === 'delivered').length
    const processing = markers.filter((m) => m.status === 'processing').length
    const total = delivered + processing
    const rate = total > 0 ? Math.round((delivered / total) * 100) : 0
    const activeStaff = new Set(markers.map((m) => m.staff_name)).size
    return { delivered, processing, total, rate, activeStaff }
  }, [data])

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-3 text-xs">
        <span className="font-bold text-green-600">{stats.delivered} delivered</span>
        {stats.processing > 0 && (
          <span className="text-amber-500">{stats.processing} processing</span>
        )}
        <span className="text-muted-foreground">{stats.activeStaff} staff</span>
      </div>
      <div className="text-xs font-bold">
        {stats.rate}%
      </div>
    </div>
  )
}
