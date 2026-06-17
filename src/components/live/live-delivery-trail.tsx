'use client'

import { useMemo } from 'react'
import { CircleMarker, Tooltip, Popup } from 'react-leaflet'
import { useDeliveryTrail } from '@/hooks/use-delivery-trail'
import { useLiveStore } from '@/stores/live-store'

const STATUS_COLORS = {
  delivered: { color: '#22c55e', fill: '#bbf7d0' },
  missed: { color: '#ef4444', fill: '#fecaca' },
  processing: { color: '#f59e0b', fill: '#fde68a' },
}

export function LiveDeliveryTrail() {
  const selectedCity = useLiveStore((s) => s.selectedCity)
  const { data } = useDeliveryTrail(selectedCity)

  const markers = useMemo(() => data?.markers || [], [data])

  if (!markers.length) return null

  return (
    <>
      {markers.map((m) => {
        const colors = STATUS_COLORS[m.status] || STATUS_COLORS.processing
        return (
          <CircleMarker
            key={m.psid}
            center={[m.lat, m.lng]}
            radius={5}
            pathOptions={{
              color: colors.color,
              fillColor: colors.fill,
              fillOpacity: 0.8,
              weight: 2,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={1} permanent={false}>
              {m.staff_name}
            </Tooltip>
            <Popup>
              <div className="text-xs space-y-1 min-w-[140px]">
                <p className="font-bold">{m.consumer_name}</p>
                <p className="text-muted-foreground">{m.psid}</p>
                <p className="capitalize">{m.status}</p>
                {m.delivered_at && (
                  <p className="text-muted-foreground">{new Date(m.delivered_at).toLocaleTimeString()}</p>
                )}
                <p className="text-muted-foreground">by {m.staff_name}</p>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </>
  )
}
