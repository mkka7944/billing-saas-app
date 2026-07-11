'use client'

import { useMemo, useRef, useEffect, useCallback, useState } from 'react'
import { useDeliveryTrail } from '@/hooks/use-delivery-trail'
import { useBillingStore } from '@/stores/billing-store'
import { useLiveStore } from '@/stores/live-store'
import { pktToday } from '@/lib/pkt'
import { CheckCircle2, XCircle, Clock } from 'lucide-react'

export function LiveActivityFeed() {
  const selectedCity = useLiveStore((s) => s.selectedCity)
  const selectedDate = useLiveStore((s) => s.selectedDate)
  const setMapCenter = useBillingStore((s) => s.setMapCenter)
  const setMapZoom = useBillingStore((s) => s.setMapZoom)
  const [visibleCount, setVisibleCount] = useState(20)
  const date = selectedDate !== pktToday() ? selectedDate : null
  const { data } = useDeliveryTrail(selectedCity, date)
  const topRef = useRef<HTMLDivElement>(null)

  const allActivities = useMemo(() => data?.activities || [], [data])
  const total = allActivities.length
  const activities = useMemo(() => allActivities.slice(0, visibleCount), [allActivities, visibleCount])

  const markerByPsid = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>()
    for (const m of data?.markers || []) {
      if (m.lat && m.lng) map.set(m.psid, { lat: m.lat, lng: m.lng })
    }
    return map
  }, [data])

  const handleActivityClick = useCallback((psid: string) => {
    const marker = markerByPsid.get(psid)
    if (!marker) return
    setMapCenter([marker.lat, marker.lng])
    setMapZoom(18)
  }, [markerByPsid, setMapCenter, setMapZoom])

  // Reset visible count when date or city changes
  useEffect(() => {
    setVisibleCount(20)
  }, [selectedDate, selectedCity])

  const handleLoadMore = useCallback(() => {
    setVisibleCount((c) => c + 20)
  }, [])

  if (!activities.length) {
    return (
      <div className="text-xs text-muted-foreground text-center py-4">
        No deliveries yet today
      </div>
    )
  }

  const statusLabel: Record<string, string> = {
    delivered: 'Delivered',
    missed: 'Missed',
    processing: 'Processing',
  }
  const statusColor: Record<string, string> = {
    delivered: 'text-green-600',
    missed: 'text-red-500',
    processing: 'text-amber-500',
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto space-y-0.5">
      <div ref={topRef} />
      {activities.map((a, i) => (
        <div key={`${a.psid}-${i}`} onClick={() => handleActivityClick(a.psid)} className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs hover:bg-muted/30 cursor-pointer">
          {a.status === 'delivered' ? (
            <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
          ) : a.status === 'missed' ? (
            <XCircle className="h-3 w-3 text-red-500 shrink-0" />
          ) : (
            <Clock className="h-3 w-3 text-amber-500 shrink-0" />
          )}
          <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums w-14">
              {a.delivered_at ? new Date(a.delivered_at).toLocaleTimeString('en-US', {
                hour: 'numeric', minute: '2-digit', hour12: true,
              }) : '—'}
            </span>
          <span className={`font-semibold shrink-0 ${statusColor[a.status] || 'text-muted-foreground'}`}>
            {statusLabel[a.status] || a.status}
          </span>
          <span className="font-medium truncate">{a.staff_name}</span>
          <span className="text-muted-foreground truncate">{a.psid}</span>
        </div>
      ))}
      {total > visibleCount && (
        <button
          onClick={handleLoadMore}
          className="w-full text-center text-xs text-muted-foreground py-2 hover:text-foreground hover:bg-muted/30 rounded-lg transition-colors cursor-pointer shrink-0"
        >
          Show older ({total - visibleCount} more)
        </button>
      )}
    </div>
  )
}
