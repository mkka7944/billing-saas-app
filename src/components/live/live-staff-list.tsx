'use client'

import { useMemo } from 'react'
import { useStaffStats } from '@/hooks/use-staff-stats'
import { CITY_TEHSIL_MAP } from '@/lib/queries/hierarchy'
import { useLiveStore } from '@/stores/live-store'
import { Circle } from 'lucide-react'

const TODAY = new Date().toISOString().slice(0, 10)

export function LiveStaffList() {
  const selectedCity = useLiveStore((s) => s.selectedCity)
  const staffGpsVisible = useLiveStore((s) => s.staffGpsVisible)
  const toggleStaffGps = useLiveStore((s) => s.toggleStaffGps)
  const cfg = CITY_TEHSIL_MAP[selectedCity]

  const { data: stats } = useStaffStats(undefined, TODAY, TODAY)

  const filtered = useMemo(() => {
    if (!stats || !cfg) return []
    return stats
      .filter((s) => s.total_assigned > 0)
      .sort((a, b) => b.rate - a.rate)
  }, [stats, cfg])

  if (!filtered.length) {
    return (
      <div className="text-xs text-muted-foreground text-center py-4">
        No staff with deliveries today
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {filtered.map((s) => {
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
