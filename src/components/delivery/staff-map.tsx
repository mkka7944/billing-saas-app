'use client'

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap, CircleMarker } from 'react-leaflet'
import L from 'leaflet'
import StaffMapMarkers from './staff-map-markers'
import SearchResultMarker from '@/components/search-result-marker'
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
    <>
      <CircleMarker
        center={[loc.lat, loc.lng]}
        radius={14}
        pathOptions={{
          color: '#22d3ee',
          fillColor: '#22d3ee',
          fillOpacity: 0.15,
          weight: 2,
        }}
      />
      <CircleMarker
        center={[loc.lat, loc.lng]}
        radius={8}
        pathOptions={{
          color: '#ffffff',
          fillColor: '#22d3ee',
          fillOpacity: 1,
          weight: 3,
        }}
      />
    </>
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
      map.flyTo(coords[0], 20, { duration: 1.2 })
      hasFittedRef.current = true
    }
  }, [items, map])

  return null
}

function FlyToTarget({ items }: { items: AssignmentItemWithUnit[] }) {
  const map = useMap()
  const deliverTargetId = useBillingStore((s) => s.deliverTargetId)
  const lastRef = useRef<string | null>(null)

  useEffect(() => {
    if (!deliverTargetId) { lastRef.current = null; return }
    if (lastRef.current === deliverTargetId) return
    lastRef.current = deliverTargetId
    const item = items.find((i) => i.psid === deliverTargetId)
    if (!item?.unit?.lat || !item.unit?.lng) return
    map.flyTo([item.unit.lat, item.unit.lng], 20, { duration: 0.5 })
  }, [deliverTargetId, items, map])

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
        <FlyToTarget items={items} />
        <SearchResultMarker />
        <StaffMapMarkers items={items} selectedPsid={deliverTargetId ?? null} />
        <UserMarker location={userLocation} />
      </MapContainer>
    </div>
  )
}
