'use client'

import { useMemo } from 'react'
import { useDeliveryTrail } from '@/hooks/use-delivery-trail'
import { useLiveStore } from '@/stores/live-store'

export function LiveSummaryBar() {
  const selectedCity = useLiveStore((s) => s.selectedCity)
  const { data } = useDeliveryTrail(selectedCity)

  const stats = useMemo(() => {
    const markers = data?.markers || []
    const delivered = markers.filter((m) => m.status === 'delivered').length
    const missed = markers.filter((m) => m.status === 'missed').length
    const processing = markers.filter((m) => m.status === 'processing').length
    const total = delivered + missed + processing
    const rate = total > 0 ? Math.round((delivered / total) * 100) : 0
    return { delivered, missed, processing, total, rate }
  }, [data])

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-3 text-xs">
        <span className="font-bold text-green-600">{stats.delivered} delivered</span>
        <span className="text-red-500">{stats.missed} missed</span>
        {stats.processing > 0 && (
          <span className="text-amber-500">{stats.processing} processing</span>
        )}
      </div>
      <div className="text-xs font-bold">
        {stats.rate}%
      </div>
    </div>
  )
}
