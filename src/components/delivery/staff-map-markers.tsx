'use client'

import { useMemo } from 'react'
import { Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useBillingStore } from '@/stores/billing-store'
import { createMarkerIcon } from '@/lib/markers'
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

  const markerIcons = useMemo(() => {
    const icons: Record<string, L.DivIcon> = {}
    for (const item of markers) {
      const color = STATUS_COLORS[item.status] || STATUS_COLORS.pending
      icons[item.id] = createMarkerIcon(color, {})
      icons[`${item.id}_sel`] = createMarkerIcon(color, { selected: true })
    }
    return icons
  }, [markers])

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

        return (
          <Marker
            key={item.id}
            position={[lat, lng]}
            icon={markerIcons[isSelected ? `${item.id}_sel` : item.id]}
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
          </Marker>
        )
      })}
    </>
  )
}
