'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useBillingStore } from '@/stores/billing-store'
import { useLiveStore } from '@/stores/live-store'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useDeliveryTrail } from '@/hooks/use-delivery-trail'
import { useSettings } from '@/hooks/use-settings'
import { pktToday } from '@/lib/pkt'
import { format } from 'date-fns'
import { DatePicker } from '@/components/ui/date-picker'
import { CITY_CONFIG } from '@/stores/billing-store'
import { LiveSummaryBar } from '@/components/live/live-summary-bar'
import { LiveUcCards } from '@/components/live/live-uc-cards'
import { LiveStaffList } from '@/components/live/live-staff-list'
import { LiveActivityFeed } from '@/components/live/live-activity-feed'
import { X, PanelRightClose, MapPin, Grip, ChevronDown, ChevronRight } from 'lucide-react'
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
  const selectedDate = useLiveStore((s) => s.selectedDate)
  const setSelectedDate = useLiveStore((s) => s.setSelectedDate)
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
  const [staffExpanded, setStaffExpanded] = useState(false)
  const { data: settings } = useSettings()
  const isPastDate = selectedDate !== pktToday()
  const pollInterval = (settings?.live_poll_interval || 60) * 1000
  const { data: trailData, dataUpdatedAt, isFetching } = useDeliveryTrail(selectedCity, isPastDate ? selectedDate : null)
  const [countdown, setCountdown] = useState(Math.round(pollInterval / 1000))
  const hasFlown = useRef(false)

  // Countdown timer for next poll refresh
  useEffect(() => {
    if (isPastDate || !dataUpdatedAt) {
      setCountdown(0)
      return
    }
    const update = () => {
      const elapsed = Date.now() - dataUpdatedAt
      setCountdown(Math.max(0, Math.round((pollInterval - elapsed) / 1000)))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [dataUpdatedAt, pollInterval, isPastDate])

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
          {!isPastDate && dataUpdatedAt > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {isFetching ? '...' : `${countdown}s`}
            </span>
          )}
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

      {/* Content — flex column so activity feed fills remaining space */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden space-y-2 p-3">
        {/* Summary KPI */}
        <div className="shrink-0"><LiveSummaryBar /></div>

        {/* Date + City row */}
        <div className="flex gap-2 shrink-0">
          <div className="flex-1">
            <DatePicker
              value={selectedDate ? new Date(selectedDate + 'T00:00:00+05:00') : undefined}
              onChange={(date) => setSelectedDate(date ? format(date, 'yyyy-MM-dd') : pktToday())}
              max={(() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d })()}
              placeholder="Select date"
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

        {/* UC Cards — collapsible */}
        <div className="shrink-0"><LiveUcCards onUcClick={handleUcClick} /></div>

        {/* Staff List — collapsed by default */}
        <div className="shrink-0">
          <button
            onClick={() => setStaffExpanded(!staffExpanded)}
            className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground mb-1.5 hover:text-foreground transition-colors cursor-pointer px-1"
          >
            {staffExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Staff
          </button>
          {staffExpanded && <LiveStaffList />}
        </div>

        {/* Activity Feed — fills remaining vertical space */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <h4 className="text-xs font-bold text-muted-foreground mb-1.5 px-1 shrink-0">Activity</h4>
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <LiveActivityFeed />
          </div>
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
