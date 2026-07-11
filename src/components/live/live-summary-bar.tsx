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
    const ucSummary = data?.ucSummary || []
    const markers = data?.markers || []

    const totalAssigned = ucSummary.reduce((sum, u) => sum + u.total_assigned, 0)
    const totalDelivered = ucSummary.reduce((sum, u) => sum + u.delivered, 0)
    const totalProcessing = ucSummary.reduce((sum, u) => sum + u.processing, 0)
    const ucCount = ucSummary.length
    const activeStaff = new Set(markers.map((m) => m.staff_name)).size
    const rate = totalAssigned > 0 ? Math.round((totalDelivered / totalAssigned) * 100) : 0

    return { totalAssigned, totalDelivered, totalProcessing, rate, activeStaff, ucCount }
  }, [data])

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-3 text-xs">
        <span className="font-bold text-green-600">{stats.totalDelivered} delivered</span>
        {stats.totalProcessing > 0 && (
          <span className="text-amber-500">{stats.totalProcessing} processing</span>
        )}
        <span className="text-muted-foreground">{stats.totalAssigned} assigned</span>
        <span className="text-muted-foreground">{stats.ucCount} UCs</span>
        <span className="text-muted-foreground">{stats.activeStaff} staff</span>
      </div>
      <div className="text-xs font-bold">
        {stats.rate}%
      </div>
    </div>
  )
}
