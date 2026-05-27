'use client'

import { useEffect, useRef, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useMap } from 'react-leaflet'
import { useBillingStore } from '@/stores/billing-store'
import { useSurveyData } from '@/hooks/use-survey-data'
import { Skeleton } from '@/components/ui/skeleton'

const MapContainer = dynamic(
  () => import('react-leaflet').then((m) => m.MapContainer),
  { ssr: false }
)
const TileLayer = dynamic(
  () => import('react-leaflet').then((m) => m.TileLayer),
  { ssr: false }
)
const SurveyMarkers = dynamic(
  () => import('@/components/survey-markers'),
  { ssr: false }
)

const GOOGLE_SUBDOMAINS = ['mt0', 'mt1', 'mt2', 'mt3']

const TILE_URLS = {
  streets:   'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  satellite: 'https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
}

function MapFollower() {
  const map = useMap()
  const mapCenter = useBillingStore((s) => s.mapCenter)

  useEffect(() => {
    map.flyTo(mapCenter, map.getZoom(), { duration: 1.2 })
  }, [map, mapCenter])

  return null
}

export function MapView() {
  const filters = useBillingStore((s) => s.filters)
  const mapType = useBillingStore((s) => s.mapType)
  const { data, isLoading } = useSurveyData(filters)

  const mapRef = useRef<HTMLDivElement>(null)

  const markers = useMemo(() => data?.data || [], [data])
  const tileUrl = TILE_URLS[mapType]

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <Skeleton className="h-64 w-full max-w-md rounded-lg" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    )
  }

  return (
    <div ref={mapRef} className="w-full h-full">
      <MapContainer
        center={[32.0836, 72.6712]}
        zoom={12}
        className="w-full h-full"
        zoomControl={true}
      >
        <TileLayer
          url={tileUrl}
          subdomains={GOOGLE_SUBDOMAINS}
          maxZoom={20}
          attribution='&copy; Google'
        />
        <MapFollower />
        <SurveyMarkers data={markers} />
      </MapContainer>
    </div>
  )
}
