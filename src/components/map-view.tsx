'use client'

import { useEffect, useRef, useMemo, memo } from 'react'
import dynamic from 'next/dynamic'
import { useMap } from 'react-leaflet'
import { useBillingStore } from '@/stores/billing-store'
import { useSurveyData } from '@/hooks/use-survey-data'
import { useMapZoom } from '@/hooks/use-map-zoom'
import { MapMarkerCount } from '@/components/map-marker-count'
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

import type { SurveyUnit } from '@/types'

const GOOGLE_SUBDOMAINS = ['mt0', 'mt1', 'mt2', 'mt3']

const TILE_URLS = {
  streets:   'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  satellite: 'https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
}

function MapFollower() {
  const map = useMap()
  const mapCenter = useBillingStore((s) => s.mapCenter)
  const { data: mapZoom = 18 } = useMapZoom()

  useEffect(() => {
    map.flyTo(mapCenter, mapZoom, { duration: 1.2 })
  }, [map, mapCenter, mapZoom])

  return null
}

function FitBoundsOnFilter({ markers }: { markers: SurveyUnit[] }) {
  const map = useMap()
  const filters = useBillingStore((s) => s.filters)
  const prevKey = useRef<string | null>(null)
  const firstRun = useRef(true)

  useEffect(() => {
    const key = JSON.stringify(filters)
    if (firstRun.current) {
      firstRun.current = false
      prevKey.current = key
      return
    }
    if (prevKey.current !== key && markers.length > 0) {
      const coords = markers
        .filter((m) => m.lat && m.lng)
        .map((m) => [m.lat, m.lng] as [number, number])
      if (coords.length > 0) {
        map.flyToBounds(coords, { padding: [50, 50], maxZoom: 16, duration: 1 })
      }
    }
    prevKey.current = key
  }, [markers, filters, map])

  return null
}

export const MapView = memo(function MapView() {
  const filters = useBillingStore((s) => s.filters)
  const mapType = useBillingStore((s) => s.mapType)
  const showAll = filters.ucs.length > 0
  const { data, isLoading } = useSurveyData(filters, 1, 50, showAll)
  const { data: mapZoom = 18 } = useMapZoom()
  const setMapMarkers = useBillingStore((s) => s.setMapMarkers)

  const mapRef = useRef<HTMLDivElement>(null)

  const markers = useMemo(() => data?.data || [], [data])
  const tileUrl = TILE_URLS[mapType]

  useEffect(() => {
    setMapMarkers(markers)
  }, [markers, setMapMarkers])

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
    <div ref={mapRef} className="w-full h-full relative">
      <MapMarkerCount />
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
          attribution='&copy; Google'
        />
        <MapFollower />
        <FitBoundsOnFilter markers={markers} />
        <SurveyMarkers data={markers} />
      </MapContainer>
    </div>
  )
})
