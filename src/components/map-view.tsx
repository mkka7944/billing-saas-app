'use client'

import { useEffect, useRef, useMemo, memo } from 'react'
import dynamic from 'next/dynamic'
import { useMap } from 'react-leaflet'
import { useBillingStore } from '@/stores/billing-store'
import { useSurveyData } from '@/hooks/use-survey-data'
import { useMapZoom } from '@/hooks/use-map-zoom'
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
  const mapZoom = useBillingStore((s) => s.mapZoom)

  const lastCenterRef = useRef<string | null>(null)

  useEffect(() => {
    const key = `${mapCenter[0]},${mapCenter[1]}`
    if (lastCenterRef.current === key) return
    lastCenterRef.current = key
    map.flyTo(mapCenter, mapZoom, { duration: 0.5 })
  }, [map, mapCenter, mapZoom])

  return null
}

function FitBoundsOnFilter({ markers }: { markers: SurveyUnit[] }) {
  const map = useMap()
  const filters = useBillingStore((s) => s.filters)
  const selectedHouseId = useBillingStore((s) => s.selectedHouseId)
  const deliverTargetId = useBillingStore((s) => s.deliverTargetId)
  const { data: mapZoom = 18 } = useMapZoom()
  const prevKey = useRef<string | null>(null)
  const firstRun = useRef(true)

  useEffect(() => {
    const key = JSON.stringify(filters)
    if (firstRun.current) {
      firstRun.current = false
      prevKey.current = key
      if (!selectedHouseId && !deliverTargetId && markers.length > 0) {
        const coords = markers
          .filter((m) => m.lat && m.lng)
          .map((m) => [m.lat, m.lng] as [number, number])
        if (coords.length > 0) {
          map.flyToBounds(coords, { padding: [50, 50], maxZoom: mapZoom, duration: 1 })
        }
      }
      return
    }
    if (prevKey.current !== key && markers.length > 0) {
      const coords = markers
        .filter((m) => m.lat && m.lng)
        .map((m) => [m.lat, m.lng] as [number, number])
      if (coords.length > 0 && !selectedHouseId && !deliverTargetId) {
        map.flyToBounds(coords, { padding: [50, 50], maxZoom: mapZoom, duration: 1 })
      }
    }
    prevKey.current = key
  }, [markers, filters, map]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

function MapFlyToTarget() {
  const map = useMap()
  const deliverTargetId = useBillingStore((s) => s.deliverTargetId)
  const mapMarkers = useBillingStore((s) => s.mapMarkers)
  const { data: mapZoom = 18 } = useMapZoom()
  const lastTargetRef = useRef<string | null>(null)

  useEffect(() => {
    if (!deliverTargetId) {
      lastTargetRef.current = null
      return
    }
    if (lastTargetRef.current === deliverTargetId) return
    lastTargetRef.current = deliverTargetId
    const marker = mapMarkers.find((m) => m.psid === deliverTargetId)
    if (marker?.lat && marker?.lng) {
      map.flyTo([marker.lat, marker.lng], mapZoom, { duration: 0.5 })
    }
  }, [deliverTargetId, mapMarkers, map, mapZoom])

  return null
}

export const MapView = memo(function MapView({ visible = true, children }: { visible?: boolean; children?: React.ReactNode }) {
  const filters = useBillingStore((s) => s.filters)
  const mapType = useBillingStore((s) => s.mapType)
  const activeView = useBillingStore((s) => s.activeView)
  const showAll = filters.ucs.length > 0
  const { data, isLoading } = useSurveyData(filters, 1, 50, showAll)
  const { data: mapZoom = 18 } = useMapZoom()
  const setMapMarkers = useBillingStore((s) => s.setMapMarkers)

  const mapRef = useRef<HTMLDivElement>(null)

  const markers = useMemo(() => data?.data || [], [data])
  const tileUrl = TILE_URLS[mapType]

  useEffect(() => {
    if (!visible) return
    setMapMarkers(markers)
  }, [markers, setMapMarkers, visible])

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
        {(visible || activeView === 'live') && (
          <>
            <MapFollower />
            <FitBoundsOnFilter markers={markers} />
            <MapFlyToTarget />
          </>
        )}
        {visible && <SurveyMarkers data={markers} />}
        {children}
      </MapContainer>
    </div>
  )
})
