'use client'

import { useMemo, useRef, useEffect, useCallback } from 'react'
import { useDeliveryTrail } from '@/hooks/use-delivery-trail'
import { useBillingStore } from '@/stores/billing-store'
import { useLiveStore } from '@/stores/live-store'
import { CheckCircle2, XCircle, Clock } from 'lucide-react'

export function LiveActivityFeed() {
  const selectedCity = useLiveStore((s) => s.selectedCity)
  const setMapCenter = useBillingStore((s) => s.setMapCenter)
  const setMapZoom = useBillingStore((s) => s.setMapZoom)
  const { data } = useDeliveryTrail(selectedCity)
  const topRef = useRef<HTMLDivElement>(null)
  const prevCount = useRef(0)

  const activities = useMemo(() => data?.activities || [], [data])

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

  useEffect(() => {
    if (activities.length > prevCount.current) {
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevCount.current = activities.length
  }, [activities.length])

  if (!activities.length) {
    return (
      <div className="text-xs text-muted-foreground text-center py-4">
        No deliveries yet today
      </div>
    )
  }

  return (
    <div className="space-y-0.5 max-h-48 overflow-y-auto">
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
          <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
              {a.delivered_at ? new Date(a.delivered_at).toLocaleTimeString('en-US', {
                hour: 'numeric', minute: '2-digit', hour12: true,
              }) : '—'}
            </span>
          <span className="font-medium truncate">{a.staff_name}</span>
          <span className="text-muted-foreground truncate">{a.psid}</span>
        </div>
      ))}
    </div>
  )
}
