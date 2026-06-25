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
    const markers = trail?.markers || []
    const activities = trail?.activities || []

    // Build marker-based data (staff_id, uc per staff)
    const markerStaffId = new Map<string, string>()
    const markerStaffUc = new Map<string, string>()
    for (const m of markers) {
      if (!markerStaffId.has(m.staff_name)) markerStaffId.set(m.staff_name, m.staff_id || m.staff_name)
      if (!markerStaffUc.has(m.staff_name)) markerStaffUc.set(m.staff_name, m.uc_name || 'Unknown')
    }

    // Build stats from activities (covers all staff even without GPS coords)
    const staffDelivered = new Map<string, number>()
    const staffTotal = new Map<string, number>()
    for (const a of activities) {
      staffTotal.set(a.staff_name, (staffTotal.get(a.staff_name) || 0) + 1)
      if (a.status === 'delivered') {
        staffDelivered.set(a.staff_name, (staffDelivered.get(a.staff_name) || 0) + 1)
      }
    }

    return Array.from(staffTotal.entries()).map(([staffName, total]) => {
      const delivered = staffDelivered.get(staffName) || 0
      return {
        staff_id: markerStaffId.get(staffName) || staffName,
        staff_name: staffName,
        delivered,
        total_assigned: total,
        rate: total > 0 ? Math.round((delivered / total) * 100) : 0,
      }
    }).sort((a, b) => b.rate - a.rate)
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
      {staffStats.map((s) => {
        const gpsOn = staffGpsVisible.has(s.staff_id)
        return (
          <div
            key={s.staff_id}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs hover:bg-muted/40 transition-colors"
          >
            <Circle className={`h-2.5 w-2.5 shrink-0 ${gpsOn ? 'fill-blue-500 text-blue-500' : 'fill-gray-300 text-gray-300'}`} />
            <span className="font-medium truncate flex-1">{s.staff_name}</span>
            <span className="text-muted-foreground shrink-0">{s.delivered}/{s.total_assigned}</span>
            <span className={`font-bold shrink-0 w-7 text-right ${s.rate >= 80 ? 'text-green-600' : s.rate >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
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
