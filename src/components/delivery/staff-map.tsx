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
  const { data: mapZoom = 18 } = useMapZoom()

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
      map.flyToBounds(bounds, { padding: [60, 60], maxZoom: mapZoom, duration: 1.2 })
      hasFittedRef.current = true
    } else if (coords.length === 1) {
      map.flyTo(coords[0], mapZoom, { duration: 1.2 })
      hasFittedRef.current = true
    }
  }, [items, map, mapZoom])

  return null
}

function MapInstanceCapture({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap()
  useEffect(() => {
    mapRef.current = map
    return () => { mapRef.current = null }
  }, [map, mapRef])
  return null
}

interface StaffMapProps {
  items: AssignmentItemWithUnit[]
  userLocation?: UserLocation | null
}

export default function StaffMap({ items, userLocation }: StaffMapProps) {
  const mapType = useBillingStore((s) => s.mapType)
  const deliverTargetId = useBillingStore((s) => s.deliverTargetId)
  const tileUrl = TILE_URLS[mapType]
  const { data: mapZoom = 18 } = useMapZoom()
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!deliverTargetId) return
    const map = mapRef.current
    if (!map) return
    const item = items.find((i) => i.psid === deliverTargetId)
    if (!item?.unit?.lat || !item.unit?.lng) return
    map.flyTo([item.unit.lat, item.unit.lng], mapZoom, { duration: 0.5 })
  }, [deliverTargetId, items, mapZoom])

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
        <StaffMapMarkers items={items} selectedPsid={deliverTargetId ?? null} />
        <MapInstanceCapture mapRef={mapRef} />
        <UserMarker location={userLocation} />
      </MapContainer>
    </div>
  )
}
