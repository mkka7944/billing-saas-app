'use client'

import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { AssignmentItemWithUnit } from '@/types'

const GOOGLE_SUBDOMAINS = ['mt0', 'mt1', 'mt2', 'mt3']
const TILE_URL = 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'

const STATUS_COLORS: Record<string, string> = {
  pending: '#3b82f6',
  delivered: '#22c55e',
  missed: '#ef4444',
  skipped: '#9ca3af',
}

function createIcon(color: string, isSelected: boolean): L.DivIcon {
  const size = isSelected ? 20 : 14
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);transition:all 0.15s"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
  })
}

interface DeliverMapProps {
  items: AssignmentItemWithUnit[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  panTo?: [number, number] | null
}

function FitBounds({ items }: { items: AssignmentItemWithUnit[] }) {
  const map = useMap()
  const done = useRef(false)

  useEffect(() => {
    if (done.current || !items.length) return
    const coords: [number, number][] = []
    for (const item of items) {
      const lat = item.unit?.lat
      const lng = item.unit?.lng
      if (lat != null && lng != null) coords.push([lat, lng])
    }
    if (coords.length) {
      const bounds = L.latLngBounds(coords)
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 })
      done.current = true
    }
  }, [map, items])

  return null
}

function PanTo({ pos }: { pos: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(pos, 18, { duration: 0.6 })
  }, [map, pos[0], pos[1]])
  return null
}

export default function DeliverMap({ items, selectedId, onSelect, panTo }: DeliverMapProps) {
  const markers = useMemo(
    () => items.filter((i) => i.unit?.lat != null && i.unit?.lng != null),
    [items]
  )

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={[32.0836, 72.6712]}
        zoom={12}
        className="w-full h-full"
        zoomControl={false}
      >
        <TileLayer
          url={TILE_URL}
          subdomains={GOOGLE_SUBDOMAINS}
          maxZoom={20}
          attribution='&copy; Google'
        />
        <FitBounds items={items} />
        {panTo && <PanTo pos={panTo} />}
        {markers.map((item) => {
          const lat = item.unit!.lat!
          const lng = item.unit!.lng!
          const isSelected = item.id === selectedId
          const color = STATUS_COLORS[item.status] || STATUS_COLORS.pending

          return (
            <Marker
              key={item.id}
              position={[lat, lng]}
              icon={createIcon(color, isSelected)}
              eventHandlers={{
                click: () => onSelect(isSelected ? null : item.id),
              }}
            >
              <Popup>
                <div className="text-xs leading-relaxed min-w-[160px]">
                  <p className="font-semibold text-sm mb-0.5">
                    {item.unit?.consumer_name || 'Unknown'}
                  </p>
                  {item.unit?.address && (
                    <p className="text-muted-foreground mb-1">{item.unit.address}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="capitalize font-medium">{item.status}</span>
                  </div>
                  {item.unit?.amount_due != null && (
                    <p className="mt-1">
                      Bill: <span className="font-bold">Rs.{Number(item.unit.amount_due).toLocaleString()}</span>
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}
