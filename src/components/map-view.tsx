'use client'

import { useEffect, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useBillingStore } from '@/stores/billing-store'
import { useSurveyData } from '@/hooks/use-survey-data'
import { useHierarchy } from '@/hooks/use-hierarchy'

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

export function MapView() {
  const filters = useBillingStore((s) => s.filters)
  const { data, isLoading } = useSurveyData(filters)
  const { data: hierarchy } = useHierarchy()

  const mapRef = useRef<HTMLDivElement>(null)

  const markers = useMemo(() => data?.data || [], [data])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading map data...
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
          url="https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=nZQar50lMcyJprudBf8i"
          attribution='<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>'
        />
        <SurveyMarkers data={markers} />
      </MapContainer>
    </div>
  )
}
