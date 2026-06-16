'use client'

import { useMemo, useRef, useCallback, memo } from 'react'
import { CircleMarker, Tooltip } from 'react-leaflet'
import { useBillingStore } from '@/stores/billing-store'
import PulsingRing from '@/components/ui/pulsing-ring'
import { STATUS_COLORS } from '@/lib/delivery-status'
import type { AssignmentItemUnit } from '@/types'
import type { LeafletMouseEvent } from 'leaflet'

interface StaffMapMarkersProps {
  items: { id: string; status: string; psid: string; unit: AssignmentItemUnit | null }[]
}

const StaffMapMarkers = memo(function StaffMapMarkers({ items }: StaffMapMarkersProps) {
  const deliverTargetId = useBillingStore((s) => s.deliverTargetId)
  const setDeliverTarget = useBillingStore((s) => s.setDeliverTarget)

  const markers = useMemo(
    () => items.filter((i) => i.unit?.lat != null && i.unit?.lng != null),
    [items]
  )

  const markersRef = useRef(markers)
  markersRef.current = markers

  const handleMarkerClick = useCallback((e: LeafletMouseEvent) => {
    const psid = (e.target as any)?.psid
    if (!psid) return
    const item = markersRef.current.find((i) => i.psid === psid)
    if (!item?.unit) return
    const currentTarget = useBillingStore.getState().deliverTargetId
    if (currentTarget === psid) {
      setDeliverTarget(null)
    } else {
      setDeliverTarget(psid, item.unit)
    }
  }, [setDeliverTarget])

  const clickHandlers = useMemo(() => ({ click: handleMarkerClick }), [handleMarkerClick])

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
              ref={(el) => { if (el) (el as any).psid = item.psid }}
              eventHandlers={clickHandlers}
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
})

export default StaffMapMarkers
