'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useBillingStore } from '@/stores/billing-store'
import { useLiveStore } from '@/stores/live-store'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useDeliveryTrail } from '@/hooks/use-delivery-trail'
import { pktToday } from '@/lib/pkt'
import { CITY_CONFIG } from '@/stores/billing-store'
import { LiveSummaryBar } from '@/components/live/live-summary-bar'
import { LiveUcCards } from '@/components/live/live-uc-cards'
import { LiveStaffList } from '@/components/live/live-staff-list'
import { LiveActivityFeed } from '@/components/live/live-activity-feed'
import { X, PanelRightClose, MapPin, Grip, Calendar } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const CITIES = ['Sargodha', 'Bhalwal', 'Khushab', 'TestCity']

export function LivePanel() {
  const setView = useBillingStore((s) => s.setView)
  const setMapCenter = useBillingStore((s) => s.setMapCenter)
  const setMapZoom = useBillingStore((s) => s.setMapZoom)
  const selectedCity = useLiveStore((s) => s.selectedCity)
  const panelCollapsed = useLiveStore((s) => s.panelCollapsed)
  const panelPos = useLiveStore((s) => s.panelPos)
  const panelWidth = useLiveStore((s) => s.panelWidth)
  const panelHeight = useLiveStore((s) => s.panelHeight)
  const setSelectedCity = useLiveStore((s) => s.setSelectedCity)
  const setPanelCollapsed = useLiveStore((s) => s.setPanelCollapsed)
  const setPanelPos = useLiveStore((s) => s.setPanelPos)
  const setPanelWidth = useLiveStore((s) => s.setPanelWidth)
  const setPanelHeight = useLiveStore((s) => s.setPanelHeight)

  const isMobile = useMediaQuery('(max-width: 767px)')
  const [selectedDate, setSelectedDate] = useState(pktToday())
  const dateLabel = selectedDate === pktToday() ? 'Today' : selectedDate
  const { data: trailData } = useDeliveryTrail(selectedCity, selectedDate !== pktToday() ? selectedDate : null)
  const hasFlown = useRef(false)

  // Fly to default city on first mount
  useEffect(() => {
    if (!hasFlown.current) {
      const cfg = CITY_CONFIG[selectedCity]
      if (cfg) {
        setMapCenter([cfg.lat, cfg.lng])
        setMapZoom(12)
      }
      hasFlown.current = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleUcClick = useCallback((ucName: string) => {
    const markers = trailData?.markers || []
    const ucMarkers = markers.filter((m) => m.uc_name === ucName && m.lat && m.lng)
    if (!ucMarkers.length) return
    const avgLat = ucMarkers.reduce((sum, m) => sum + m.lat, 0) / ucMarkers.length
    const avgLng = ucMarkers.reduce((sum, m) => sum + m.lng, 0) / ucMarkers.length
    setMapCenter([avgLat, avgLng])
    setMapZoom(15)
  }, [trailData, setMapCenter, setMapZoom])

  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number | null } | null>(null)

  const handleCityChange = useCallback((city: string) => {
    setSelectedCity(city)
    const cfg = CITY_CONFIG[city]
    if (cfg) {
      setMapCenter([cfg.lat, cfg.lng])
      setMapZoom(12)
    }
  }, [setSelectedCity, setMapCenter, setMapZoom])

  const handleExitLive = useCallback(() => {
    setView('map')
  }, [setView])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: panelPos.x,
      origY: panelPos.y,
    }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      setPanelPos({
        x: dragRef.current.origX + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.origY + (ev.clientY - dragRef.current.startY),
      })
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelPos, setPanelPos])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origW: panelWidth,
      origH: panelHeight,
    }
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      const r = resizeRef.current
      const newW = Math.max(280, Math.min(600, r.origW + (r.startX - ev.clientX)))
      setPanelWidth(newW)
      const newH = r.origH !== null
        ? Math.max(200, Math.min(window.innerHeight - 40, r.origH + (ev.clientY - r.startY)))
        : Math.max(200, Math.min(window.innerHeight - 40, ev.clientY - (8 + panelPos.y)))
      setPanelHeight(newH)
    }
    const onUp = () => {
      resizeRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelWidth, panelHeight, setPanelWidth, setPanelHeight, panelPos])

  if (panelCollapsed) {
    if (isMobile) {
      return (
        <button
          onClick={() => setPanelCollapsed(false)}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-1.5 px-3 py-2 rounded-full bg-card border border-border shadow-lg hover:bg-muted cursor-pointer text-xs font-bold text-muted-foreground"
          title="Expand live panel"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          LIVE
          <PanelRightClose className="h-3 w-3" />
        </button>
      )
    }
    return (
      <button
        onClick={() => setPanelCollapsed(false)}
        onMouseDown={handleMouseDown}
        className="fixed z-[9999] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card border border-border shadow-lg hover:bg-muted cursor-grab active:cursor-grabbing text-xs font-bold text-muted-foreground select-none"
        style={{ right: 8 - (panelPos.x || 0), top: 8 + (panelPos.y || 0) }}
        title="Expand live panel"
      >
        LIVE
        <PanelRightClose className="h-3 w-3" />
      </button>
    )
  }

  return (
    <div
      className={`fixed z-[9999] flex flex-col bg-white/95 dark:bg-neutral-950/95 backdrop-blur-sm border border-border shadow-xl overflow-hidden ${
        isMobile ? 'left-0 right-0 bottom-0 rounded-t-xl rounded-b-none' : 'rounded-xl'
      }`}
      style={isMobile ? {
        height: panelHeight ?? '40vh',
        maxHeight: '85vh',
      } : {
        width: panelWidth,
        right: 8 - (panelPos.x || 0),
        top: 8 + (panelPos.y || 0),
        height: panelHeight ?? 500,
      }}
    >
      {/* Header — drag handle */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-bold">LIVE</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPanelCollapsed(true)}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted cursor-pointer"
            title="Collapse panel"
          >
            <PanelRightClose className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={handleExitLive}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted cursor-pointer"
            title="Exit live monitoring"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-3 p-3">
        {/* Summary KPI */}
        <LiveSummaryBar />

        {/* Date + City row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={pktToday()}
              className="w-full h-8 pl-7 pr-2 text-xs font-medium rounded-lg border border-input bg-background [color-scheme:light_dark] focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="relative w-[140px] shrink-0">
            <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" />
            <Select value={selectedCity} onValueChange={(value) => value && handleCityChange(value)}>
              <SelectTrigger className="w-full h-8 pl-7 pr-3 text-xs font-medium rounded-lg [&>svg]:text-muted-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                {CITIES.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* UC Cards */}
        <LiveUcCards onUcClick={handleUcClick} />

        {/* Staff List */}
        <div>
          <h4 className="text-xs font-bold text-muted-foreground mb-1.5 px-1">Staff</h4>
          <LiveStaffList />
        </div>

        {/* Activity Feed */}
        <div>
          <h4 className="text-xs font-bold text-muted-foreground mb-1.5 px-1">Activity</h4>
          <LiveActivityFeed />
        </div>
      </div>

      {/* Resize handle — hidden on mobile */}
      {!isMobile && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute bottom-0 right-0 w-5 h-5 flex items-center justify-center cursor-se-resize select-none"
        >
          <Grip className="h-3 w-3 text-muted-foreground/50" />
        </div>
      )}
    </div>
  )
}
