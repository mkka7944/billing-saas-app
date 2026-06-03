'use client'

import { useMemo } from 'react'
import { Marker, Popup } from 'react-leaflet'
import { useBillingStore } from '@/stores/billing-store'
import { createMarkerIcon } from '@/lib/markers'
import type { SurveyUnit } from '@/types'

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

const grayIcon = createMarkerIcon('#9ca3af', { size: 10 })

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
          icon={createMarkerIcon(getUcColor(s.uc_name), { size: 10 })}
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
