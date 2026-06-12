'use client'

import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
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
  const map = useMap()
  const divRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = divRef.current
    if (!el) return

    const update = () => {
      const pt = map.latLngToContainerPoint(L.latLng(center[0], center[1]))
      el.style.left = `${pt.x - RING_SIZE / 2}px`
      el.style.top = `${pt.y - RING_SIZE / 2}px`
    }
    update()
    map.on('move zoom', update)
    return () => { map.off('move zoom', update) }
  }, [map, center[0], center[1]])

  return (
    <div
      ref={divRef}
      style={{
        position: 'absolute',
        width: RING_SIZE,
        height: RING_SIZE,
        borderRadius: '50%',
        border: '2.5px solid rgba(255,255,255,0.9)',
        boxShadow: '0 0 8px rgba(0,0,0,0.5)',
        animation: `${KEYFRAME} 1.5s ease-in-out infinite`,
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    />
  )
}
