'use client'

import { useMemo } from 'react'
import { Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useBillingStore } from '@/stores/billing-store'
import type { SurveyUnit } from '@/types'

function createIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -8],
  })
}

const greenIcon = createIcon('#22c55e')
const redIcon = createIcon('#ef4444')
const amberIcon = createIcon('#f59e0b')
const grayIcon = createIcon('#9ca3af')

interface SurveyMarkersProps {
  data: SurveyUnit[]
}

export default function SurveyMarkers({ data }: SurveyMarkersProps) {
  const selectHouse = useBillingStore((s) => s.selectHouse)

  const markers = useMemo(() => {
    return data
      .filter((s) => s.lat && s.lng)
      .map((s) => ({
        ...s,
        icon: s.lat && s.lng ? 'default' : null,
      }))
  }, [data])

  if (!markers.length) return null

  return (
    <>
      {markers.map((s) => (
        <Marker
          key={s.survey_id}
          position={[s.lat!, s.lng!]}
          icon={grayIcon}
          eventHandlers={{
            click: () => selectHouse(s.survey_id),
          }}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-medium">{s.consumer_name || 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">{s.survey_id}</p>
              {s.address && <p className="text-xs mt-1">{s.address}</p>}
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  )
}
