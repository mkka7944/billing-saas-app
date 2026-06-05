'use client'

import { useEffect, useMemo } from 'react'
import { Marker, Tooltip } from 'react-leaflet'
import { useBillingStore } from '@/stores/billing-store'
import { createMarkerIcon } from '@/lib/markers'
import type { SurveyUnit, AssignmentItemUnit } from '@/types'

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

function toAssignmentUnit(s: SurveyUnit): AssignmentItemUnit | null {
  if (!s.psid) return null
  return {
    psid: s.psid,
    survey_id: s.survey_id,
    consumer_name: s.consumer_name,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    monthly_fee: s.monthly_fee ?? null,
    arrears: s.arrears,
    route_name: s.route_name,
    route_seq: s.route_seq,
    uc_name: s.uc_name,
    image_urls: s.image_urls ?? [],
  }
}

export default function SurveyMarkers({ data }: SurveyMarkersProps) {
  const deliverTargetId = useBillingStore((s) => s.deliverTargetId)
  const setDeliverTarget = useBillingStore((s) => s.setDeliverTarget)
  const setDeliverableList = useBillingStore((s) => s.setDeliverableList)

  const markers = useMemo(() => {
    return data.filter((s) => s.lat && s.lng && s.psid)
  }, [data])

  const deliverableList = useMemo<AssignmentItemUnit[]>(
    () => markers.map((s) => toAssignmentUnit(s)!).filter((u): u is AssignmentItemUnit => u !== null),
    [markers]
  )

  useEffect(() => {
    setDeliverableList(deliverableList)
  }, [deliverableList, setDeliverableList])

  if (!markers.length) return null

  return (
    <>
      {markers.map((s) => {
        const unit = toAssignmentUnit(s)
        if (!unit) return null
        const isSelected = deliverTargetId != null && s.psid === deliverTargetId
        return (
          <Marker
            key={s.survey_id}
            position={[s.lat!, s.lng!]}
            icon={createMarkerIcon(getUcColor(s.uc_name), { size: 10, selected: isSelected })}
            eventHandlers={{
              click: () => {
                setDeliverTarget(s.psid, unit)
              },
            }}
          >
            <Tooltip
              direction="top"
              offset={[0, -8]}
              className="survey-tooltip"
              opacity={1}
            >
              {s.survey_id}
            </Tooltip>
          </Marker>
        )
      })}
    </>
  )
}
