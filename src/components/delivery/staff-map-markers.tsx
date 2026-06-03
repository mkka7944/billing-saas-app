'use client'

import { useMemo } from 'react'
import { Marker } from 'react-leaflet'
import { useBillingStore } from '@/stores/billing-store'
import { createMarkerIcon } from '@/lib/markers'
import type { AssignmentItemUnit } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  pending: '#3b82f6',
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

  return (
    <>
      {markers.map((item) => {
        const lat = item.unit!.lat!
        const lng = item.unit!.lng!
        const isSelected = deliverTargetId != null && item.psid === deliverTargetId
        const color = STATUS_COLORS[item.status] || STATUS_COLORS.pending

        return (
          <Marker
            key={item.id}
            position={[lat, lng]}
            icon={createMarkerIcon(color, { selected: isSelected })}
            eventHandlers={{
              click: () => {
                setDeliverTarget(
                  deliverTargetId === item.psid ? null : item.psid
                )
              },
            }}
          />
        )
      })}
    </>
  )
}
