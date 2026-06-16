'use client'

import { useMemo } from 'react'
import { Marker } from 'react-leaflet'
import L from 'leaflet'

const RING_SIZE = 40
const KEYFRAME = 'marker-pulse-overlay'

if (typeof document !== 'undefined' && !document.getElementById('marker-pulse-overlay-style')) {
  const style = document.createElement('style')
  style.id = 'marker-pulse-overlay-style'
  style.textContent = `@keyframes ${KEYFRAME}{0%{transform:scale(0.6);opacity:0.9}100%{transform:scale(2.5);opacity:0}}`
  document.head.appendChild(style)
}

interface PulsingRingProps {
  center: [number, number]
}

export default function PulsingRing({ center }: PulsingRingProps) {
  const pulseIcon = useMemo(() => L.divIcon({
    className: '',
    html: `<div style="width:${RING_SIZE}px;height:${RING_SIZE}px;border-radius:50%;border:2.5px solid rgba(255,255,255,0.9);box-shadow:0 0 8px rgba(0,0,0,0.5);animation:${KEYFRAME} 1.5s ease-in-out infinite"></div>`,
    iconSize: [RING_SIZE, RING_SIZE],
    iconAnchor: [RING_SIZE / 2, RING_SIZE / 2],
  }), [])

  return <Marker position={center} icon={pulseIcon} interactive={false} />
}
