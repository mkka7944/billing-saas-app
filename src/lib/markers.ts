import L from 'leaflet'

// Inject pulse keyframes once
if (typeof document !== 'undefined' && !document.getElementById('marker-pulse-style')) {
  const style = document.createElement('style')
  style.id = 'marker-pulse-style'
  style.textContent = `@keyframes marker-pulse{0%{transform:translate(-50%,-50%) scale(0.6);opacity:0.5}100%{transform:translate(-50%,-50%) scale(2.5);opacity:0}}`
  document.head.appendChild(style)
}

interface MarkerOptions {
  selected?: boolean
  size?: number
}

export function createMarkerIcon(color: string, opts?: MarkerOptions): L.DivIcon {
  const size = opts?.size ?? 12
  const border = opts?.selected
    ? '2px solid #1e40af'
    : '2px solid rgba(0,0,0,0.35)'

  let html: string
  if (opts?.selected) {
    html = `<div style="position:relative;width:${size}px;height:${size}px"><div style="position:absolute;top:50%;left:50%;width:${size * 3}px;height:${size * 3}px;border-radius:50%;border:2px solid ${color}66;animation:marker-pulse 1.5s ease-in-out infinite;pointer-events:none"></div><div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${border};position:relative;z-index:1"></div></div>`
  } else {
    html = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${border}"></div>`
  }

  return L.divIcon({
    className: '',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
  })
}
