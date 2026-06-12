'use client'

import { useMemo } from 'react'
import { CircleMarker, Tooltip } from 'react-leaflet'
import { useBillingStore } from '@/stores/billing-store'
import PulsingRing from '@/components/ui/pulsing-ring'
import type { AssignmentItemUnit } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  pending: '#3b82f6',
  processing: '#f59e0b',
  delivered: '#22c55e',
  missed: '#ef4444',
  skipped: '#9ca3af',
}

interface StaffMapMarkersProps {
  items: { id: string; status: string; psid: string; unit: AssignmentItemUnit | null }[]
}

export default function StaffMapMarkers({ items }: StaffMapMarkersProps) {
  const deliverTargetId = useBillingStore((s) => s.deliverTargetId)
  const setDeliverTarget = useBillingStore((s) => s.setDeliverTarget)

  const markers = useMemo(
    () => items.filter((i) => i.unit?.lat != null && i.unit?.lng != null),
    [items]
  )

  const handleClick = useMemo(() => {
    const fn = (psid: string, unit: AssignmentItemUnit | null, currentTarget: string | null) => () => {
      if (currentTarget === psid) {
        setDeliverTarget(null)
      } else {
        setDeliverTarget(psid, unit)
      }
    }
    return fn
  }, [setDeliverTarget])

  return (
    <>
      {markers.map((item) => {
        const lat = item.unit!.lat!
        const lng = item.unit!.lng!
        const isSelected = deliverTargetId != null && item.psid === deliverTargetId
        const color = STATUS_COLORS[item.status] || STATUS_COLORS.pending

        return (
          <div key={item.id}>
            {isSelected && (
              <PulsingRing center={[lat, lng]} />
            )}
            <CircleMarker
              center={[lat, lng]}
              radius={isSelected ? 7 : 6}
              pathOptions={{
                color: isSelected ? '#1e40af' : 'rgba(0,0,0,0.35)',
                fillColor: color,
                fillOpacity: 1,
                weight: 2,
              }}
              eventHandlers={{ click: handleClick(item.psid, item.unit, deliverTargetId) }}
            >
              <Tooltip
                direction="top"
                offset={[0, -8]}
                className="survey-tooltip"
                opacity={1}
              >
                {item.unit?.survey_id || item.psid}
              </Tooltip>
            </CircleMarker>
          </div>
        )
      })}
    </>
  )
}
