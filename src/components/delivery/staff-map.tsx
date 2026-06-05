'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, useMap, Marker } from 'react-leaflet'
import L from 'leaflet'
import StaffMapMarkers from './staff-map-markers'
import { useBillingStore } from '@/stores/billing-store'
import { useUserLocation } from '@/hooks/use-user-location'
import type { AssignmentItemWithUnit } from '@/types'

const GOOGLE_SUBDOMAINS = ['mt0', 'mt1', 'mt2', 'mt3']

const TILE_URLS = {
  streets:   'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  satellite: 'https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
}

const USER_DOT_ICON = L.divIcon({
  className: 'user-location-dot',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

function UserMarker() {
  const { location } = useUserLocation()
  if (!location) return null

  return <Marker position={[location.lat, location.lng]} icon={USER_DOT_ICON} />
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
        <UserMarker />
      </MapContainer>
    </div>
  )
}
