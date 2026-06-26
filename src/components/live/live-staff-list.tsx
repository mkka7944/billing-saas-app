'use client'

import { useMemo } from 'react'
import { useDeliveryTrail } from '@/hooks/use-delivery-trail'
import { useLiveStore } from '@/stores/live-store'
import { pktToday } from '@/lib/pkt'
import { Circle } from 'lucide-react'

export function LiveStaffList() {
  const selectedCity = useLiveStore((s) => s.selectedCity)
  const selectedDate = useLiveStore((s) => s.selectedDate)
  const staffGpsVisible = useLiveStore((s) => s.staffGpsVisible)
  const toggleStaffGps = useLiveStore((s) => s.toggleStaffGps)

  const { data: trail } = useDeliveryTrail(selectedCity, selectedDate !== pktToday() ? selectedDate : null)

  const staffStats = useMemo(() => {
    const summary = trail?.staffSummary
    if (!summary) return []

    return Object.entries(summary).map(([staffName, s]) => ({
      staff_id: s.staff_id,
      staff_name: staffName,
      delivered: s.delivered,
      assigned: s.assigned || s.total_actioned,
      pending: s.pending,
      total_actioned: s.total_actioned,
      rate: s.assigned > 0 ? Math.round((s.delivered / s.assigned) * 100) : 0,
    })).sort((a, b) => b.rate - a.rate)
  }, [trail])

  if (!staffStats.length) {
    return (
      <div className="text-xs text-muted-foreground text-center py-4">
        No staff with deliveries today
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
        <span className="flex-1">Name</span>
        <span className="w-5 text-center">A</span>
        <span className="w-5 text-center">D</span>
        <span className="w-5 text-center">P</span>
        <span className="w-7 text-right">Rate</span>
        <span className="w-5" />
      </div>
      {staffStats.map((s) => {
        const gpsOn = staffGpsVisible.has(s.staff_id)
        return (
          <div
            key={s.staff_id}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs hover:bg-muted/40 transition-colors"
          >
            <Circle className={`h-2.5 w-2.5 shrink-0 ${gpsOn ? 'fill-blue-500 text-blue-500' : 'fill-gray-300 text-gray-300'}`} />
            <span className="font-medium truncate flex-1">{s.staff_name}</span>
            <span className="text-muted-foreground shrink-0 w-5 text-center tabular-nums">{s.assigned}</span>
            <span className="text-green-600 shrink-0 w-5 text-center tabular-nums">{s.delivered}</span>
            <span className="text-amber-500 shrink-0 w-5 text-center tabular-nums">{s.pending}</span>
            <span className={`font-bold shrink-0 w-7 text-right tabular-nums ${s.rate >= 80 ? 'text-green-600' : s.rate >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
              {s.rate}%
            </span>
            <button
              onClick={() => toggleStaffGps(s.staff_id)}
              className={`h-5 w-5 flex items-center justify-center rounded text-[9px] font-bold cursor-pointer transition-colors shrink-0 ${
                gpsOn
                  ? 'bg-blue-500 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-blue-100 dark:hover:bg-blue-900/30'
              }`}
              title={gpsOn ? 'Hide on map' : 'Show on map'}
            >
              GPS
            </button>
          </div>
        )
      })}
    </div>
  )
}
