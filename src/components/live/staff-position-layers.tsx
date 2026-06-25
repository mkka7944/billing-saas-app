'use client'

import { useMemo } from 'react'
import { CircleMarker, Tooltip, Popup } from 'react-leaflet'
import { useStaffPositions } from '@/hooks/use-staff-positions'
import { useLiveStore } from '@/stores/live-store'

export function StaffPositionLayers() {
  const staffGpsVisible = useLiveStore((s) => s.staffGpsVisible)
  const { data: positions } = useStaffPositions()

  const filtered = useMemo(
    () => (positions || []).filter((p) => staffGpsVisible.has(p.staff_id)),
    [positions, staffGpsVisible]
  )

  if (!filtered.length) return null

  return (
    <>
      {filtered.map((pos) => {
        const firstName = pos.staff_name?.split(' ')[0] || pos.staff_name
        return (
          <CircleMarker
            key={pos.staff_id}
            center={[pos.lat, pos.lng]}
            radius={7}
            pathOptions={{
              color: '#22d3ee',
              fillColor: pos.is_active ? '#22d3ee' : '#94a3b8',
              fillOpacity: 0.9,
              weight: 2.5,
            }}
          >
            <Tooltip direction="top" offset={[0, -12]} opacity={1} permanent>
              <span className="text-[11px] font-bold">{firstName}</span>
            </Tooltip>
            <Popup>
              <div className="text-xs space-y-1 min-w-[140px]">
                <p className="font-bold">{pos.staff_name}</p>
                <p className={pos.is_active ? 'text-green-600' : 'text-muted-foreground'}>
                  {pos.is_active ? '● Active' : '○ Offline'}
                </p>
                <p className="text-muted-foreground">
                  Last seen: {new Date(pos.last_seen).toLocaleTimeString()}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </>
  )
}
