'use client'

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap, CircleMarker } from 'react-leaflet'
import L from 'leaflet'
import StaffMapMarkers from './staff-map-markers'
import { useBillingStore } from '@/stores/billing-store'
import { useUserLocation } from '@/hooks/use-user-location'
import { useMapZoom } from '@/hooks/use-map-zoom'
import type { AssignmentItemWithUnit } from '@/types'
import type { UserLocation } from '@/hooks/use-user-location'

const GOOGLE_SUBDOMAINS = ['mt0', 'mt1', 'mt2', 'mt3']

const TILE_URLS = {
  streets:   'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  satellite: 'https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
}

function UserMarker({ location: propLocation }: { location?: UserLocation | null }) {
  const { location: hookLocation } = useUserLocation()
  const loc = propLocation || hookLocation
  if (!loc) return null

  return (
    <CircleMarker
      center={[loc.lat, loc.lng]}
      radius={7}
      pathOptions={{
        color: '#ffffff',
        fillColor: '#3b82f6',
        fillOpacity: 1,
        weight: 3,
      }}
    />
  )
}

function FitStaffBounds({ items }: { items: AssignmentItemWithUnit[] }) {
  const map = useMap()
  const hasFittedRef = useRef(false)

  useEffect(() => {
    if (hasFittedRef.current || !items?.length) return

    const coords: [number, number][] = []
    for (const item of items) {
      if (item.unit?.lat != null && item.unit?.lng != null) {
        coords.push([item.unit.lat, item.unit.lng])
      }
    }

    if (coords.length >= 2) {
      const bounds = L.latLngBounds(coords)
      map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 20, duration: 1.2 })
      hasFittedRef.current = true
    } else if (coords.length === 1) {
      map.flyTo(coords[0], 15, { duration: 1.2 })
      hasFittedRef.current = true
    }
  }, [items, map])

  return null
}

function FlyToTarget({ items }: { items: AssignmentItemWithUnit[] }) {
  const map = useMap()
  const deliverTargetId = useBillingStore((s) => s.deliverTargetId)
  const { data: mapZoom = 18 } = useMapZoom()
  const lastFlyRef = useRef<{ target: string | null; zoom: number }>({ target: null, zoom: 18 })

  useEffect(() => {
    if (!deliverTargetId) {
      lastFlyRef.current = { target: null, zoom: mapZoom }
      return
    }
    const item = items.find((i) => i.psid === deliverTargetId)
    if (!item?.unit?.lat || !item.unit?.lng) return

    const last = lastFlyRef.current
    if (last.target === deliverTargetId && last.zoom === mapZoom) return
    lastFlyRef.current = { target: deliverTargetId, zoom: mapZoom }

    map.flyTo([item.unit.lat, item.unit.lng], mapZoom, { duration: 0.5 })
  }, [deliverTargetId, items, map, mapZoom])

  return null
}

interface StaffMapProps {
  items: AssignmentItemWithUnit[]
  userLocation?: UserLocation | null
}

export default function StaffMap({ items, userLocation }: StaffMapProps) {
  const mapType = useBillingStore((s) => s.mapType)
  const tileUrl = TILE_URLS[mapType]
  const { data: mapZoom = 18 } = useMapZoom()

  return (
    <div className="w-full h-full">
      <MapContainer
        center={[32.0836, 72.6712]}
        zoom={mapZoom}
        className="w-full h-full"
        zoomControl={false}
        preferCanvas={true}
      >
        <TileLayer
          url={tileUrl}
          subdomains={GOOGLE_SUBDOMAINS}
          maxZoom={20}
          updateWhenIdle={true}
          attribution="&copy; Google"
        />
        <FitStaffBounds items={items} />
        <StaffMapMarkers items={items} />
        <FlyToTarget items={items} />
        <UserMarker location={userLocation} />
      </MapContainer>
    </div>
  )
}
