'use client'

import { useMemo } from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { useBillingStore } from '@/stores/billing-store'
import type { SurveyUnit } from '@/types'

function createIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 2px rgba(0,0,0,0.2)"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
    popupAnchor: [0, -7],
  })
}

const UC_COLORS = [
  '#0072f5', '#e5484d', '#ffb224', '#36a2eb', '#ff6384',
  '#4bc0c0', '#9966ff', '#ff9f40', '#7c3aed', '#0ea5e9',
  '#f43f5e', '#10b981', '#f59e0b', '#6366f1', '#14b8a6',
  '#a855f7', '#ef4444', '#22c55e', '#eab308', '#3b82f6',
]

function getUcColor(ucName: string | null): string {
  if (!ucName) return '#9ca3af'
  let hash = 0
  for (let i = 0; i < ucName.length; i++) {
    hash = ((hash << 5) - hash) + ucName.charCodeAt(i)
    hash = hash & hash
  }
  return UC_COLORS[Math.abs(hash) % UC_COLORS.length]
}

const grayIcon = createIcon('#9ca3af')

interface SurveyMarkersProps {
  data: SurveyUnit[]
}

export default function SurveyMarkers({ data }: SurveyMarkersProps) {
  const selectHouse = useBillingStore((s) => s.selectHouse)

  const markers = useMemo(() => {
    return data.filter((s) => s.lat && s.lng)
  }, [data])

  if (!markers.length) return null

  return (
    <>
      {markers.map((s) => (
        <Marker
          key={s.survey_id}
          position={[s.lat!, s.lng!]}
          icon={createIcon(getUcColor(s.uc_name))}
          eventHandlers={{
            click: () => selectHouse(s.survey_id),
          }}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-medium">{s.consumer_name || 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">{s.survey_id}</p>
              {s.uc_name && <p className="text-xs text-muted-foreground">{s.uc_name}</p>}
              {s.address && <p className="text-xs mt-1">{s.address}</p>}
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  )
}
