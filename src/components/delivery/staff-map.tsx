'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import StaffMapMarkers from './staff-map-markers'
import { useBillingStore } from '@/stores/billing-store'
import type { AssignmentItemWithUnit } from '@/types'

const GOOGLE_SUBDOMAINS = ['mt0', 'mt1', 'mt2', 'mt3']

const TILE_URLS = {
  streets:   'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  satellite: 'https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
}

function FlyToTarget({ items }: { items: AssignmentItemWithUnit[] }) {
  const map = useMap()
  const deliverTargetId = useBillingStore((s) => s.deliverTargetId)

  useEffect(() => {
    if (!deliverTargetId) return
    const item = items.find((i) => i.psid === deliverTargetId)
    if (!item?.unit?.lat || !item.unit?.lng) return
    map.flyTo([item.unit.lat, item.unit.lng], 18, { duration: 1 })
  }, [deliverTargetId, items, map])

  return null
}

interface StaffMapProps {
  items: AssignmentItemWithUnit[]
}

export default function StaffMap({ items }: StaffMapProps) {
  const mapType = useBillingStore((s) => s.mapType)
  const tileUrl = TILE_URLS[mapType]

  return (
    <div className="w-full h-full">
      <MapContainer
        center={[32.0836, 72.6712]}
        zoom={12}
        className="w-full h-full"
        zoomControl={false}
      >
        <TileLayer
          url={tileUrl}
          subdomains={GOOGLE_SUBDOMAINS}
          maxZoom={20}
          attribution="&copy; Google"
        />
        <StaffMapMarkers items={items} />
        <FlyToTarget items={items} />
      </MapContainer>
    </div>
  )
}
