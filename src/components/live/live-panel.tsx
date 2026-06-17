'use client'

import { useCallback, useRef } from 'react'
import { useBillingStore } from '@/stores/billing-store'
import { useLiveStore } from '@/stores/live-store'
import { CITY_CONFIG } from '@/stores/billing-store'
import { LiveSummaryBar } from '@/components/live/live-summary-bar'
import { LiveUcCards } from '@/components/live/live-uc-cards'
import { LiveStaffList } from '@/components/live/live-staff-list'
import { LiveActivityFeed } from '@/components/live/live-activity-feed'
import { X, PanelRightClose, MapPin } from 'lucide-react'

const CITIES = ['Sargodha', 'Bhalwal', 'Khushab', 'TestCity']

export function LivePanel() {
  const setView = useBillingStore((s) => s.setView)
  const setMapCenter = useBillingStore((s) => s.setMapCenter)
  const selectedCity = useLiveStore((s) => s.selectedCity)
  const panelCollapsed = useLiveStore((s) => s.panelCollapsed)
  const panelPos = useLiveStore((s) => s.panelPos)
  const setSelectedCity = useLiveStore((s) => s.setSelectedCity)
  const setPanelCollapsed = useLiveStore((s) => s.setPanelCollapsed)
  const setPanelPos = useLiveStore((s) => s.setPanelPos)

  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const handleCityChange = useCallback((city: string) => {
    setSelectedCity(city)
    const cfg = CITY_CONFIG[city]
    if (cfg) setMapCenter([cfg.lat, cfg.lng])
  }, [setSelectedCity, setMapCenter])

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

  if (panelCollapsed) {
    return (
      <button
        onClick={() => setPanelCollapsed(false)}
        className="fixed right-3 top-4 z-[9999] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card border border-border shadow-lg hover:bg-muted cursor-pointer text-xs font-bold text-muted-foreground"
        title="Expand live panel"
      >
        LIVE
        <PanelRightClose className="h-3 w-3" />
      </button>
    )
  }

  return (
    <div
      className="fixed z-[9999] w-80 flex flex-col bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-xl overflow-hidden"
      style={{ right: 8 - (panelPos.x || 0), top: 8 + (panelPos.y || 0), bottom: 8 }}
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

        {/* City dropdown */}
        <div className="relative">
          <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <select
            value={selectedCity}
            onChange={(e) => handleCityChange(e.target.value)}
            className="w-full h-8 pl-7 pr-3 rounded-lg border border-border bg-background text-xs font-medium outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
          >
            {CITIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* UC Cards */}
        <LiveUcCards />

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
    </div>
  )
}
