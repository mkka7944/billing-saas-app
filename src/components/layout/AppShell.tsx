'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingStore, CITY_CONFIG } from '@/stores/billing-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { BillingSidebar } from './BillingSidebar'
import { AppHeader } from './AppHeader'
import { DesktopFilterBar } from '@/components/filter-panel'
import { MapIcon, List, Truck, BarChart3, QrCode, X, Loader2, Scan } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { cn } from '@/lib/utils'
import type { AssignmentItemWithUnit } from '@/types'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const roleName = useAuthStore((s) => s.roleName)
  const assignedCity = useAuthStore((s) => s.assignedCity)
  const setCity = useBillingStore((s) => s.setCity)
  const activeView = useBillingStore((s) => s.activeView)
  const setView = useBillingStore((s) => s.setView)
  const { setSidebarOpen } = useBillingUIStore()

  // Auto-select assigned city for field staff on mount (skip if already set)
  useEffect(() => {
    if (roleName === 'field_staff' && assignedCity) {
      const { selectedCity } = useBillingStore.getState()
      if (selectedCity === assignedCity) return
      const cfg = CITY_CONFIG[assignedCity]
      if (cfg) setCity(assignedCity, cfg.district, cfg.tehsil)
    }
  }, [roleName, assignedCity, setCity])

  // QR scanner state
  const [showScanner, setShowScanner] = useState(false)
  const [scanItems, setScanItems] = useState<AssignmentItemWithUnit[]>([])
  const [scanError, setScanError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        await scannerRef.current.clear()
      } catch {}
      scannerRef.current = null
    }
    setIsScanning(false)
  }, [])

  const handleCloseScanner = useCallback(() => {
    stopScanner()
    setShowScanner(false)
    setScanError(null)
    setManualInput('')
    setScanItems([])
  }, [stopScanner])

  const startScanner = useCallback(async () => {
    setScanError(null)
    setIsScanning(true)
    const scanner = new Html5Qrcode('qr-reader-shell')
    scannerRef.current = scanner
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          const match = decodedText.match(/sid=([A-Za-z0-9_-]+)/)
          if (!match) {
            setScanError('No survey ID (sid=) found in QR code')
            return
          }
          const surveyId = match[1]
          const matched = scanItems.find((i) => i.survey_id === surveyId)
          if (!matched) {
            setScanError(`No assignment matches survey ID: ${surveyId}`)
            return
          }
          if (mountedRef.current) {
            stopScanner()
            setShowScanner(false)
            setScanError(null)
            router.push(`/map?target=${encodeURIComponent(matched.psid)}`)
          }
        },
        () => {},
      )
    } catch (e) {
      if (mountedRef.current) {
        setScanError(`Camera error: ${(e as Error).message}`)
        setIsScanning(false)
      }
    }
  }, [scanItems, stopScanner, router])

  const openScanner = useCallback(async () => {
    setShowScanner(true)
    setScanError(null)
    setIsScanning(false)
    setManualInput('')
    const user = useAuthStore.getState().user
    if (!user?.id) return
    try {
      const res = await fetch(`/api/assignments?staff_id=${user.id}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setScanItems(data.items || [])
    } catch {
      setScanError('Could not load assignment data')
    }
  }, [])

  const handleManualSubmit = useCallback(() => {
    const sid = manualInput.trim()
    if (!sid) return
    const matched = scanItems.find((i) => i.survey_id === sid)
    if (!matched) {
      setScanError(`No assignment matches survey ID: ${sid}`)
      return
    }
    handleCloseScanner()
    router.push(`/map?target=${encodeURIComponent(matched.psid)}`)
  }, [manualInput, scanItems, handleCloseScanner, router])

  // Bottom tabs — keep only core views; everything else goes in sidebar
  const tabs = [
    { id: 'map' as const, label: 'Map', icon: MapIcon, href: undefined as string | undefined },
    { id: 'list' as const, label: 'List', icon: List, href: undefined as string | undefined },
    { id: 'scan' as const, label: 'SCAN', icon: QrCode, href: undefined as string | undefined },
    { id: 'deliver' as const, label: 'Deliver', icon: Truck, href: '/deliver' as string | undefined },
    { id: 'stats' as const, label: 'Stats', icon: BarChart3, href: '/stats' as string | undefined },
  ]

  // Debounced resize handler
  const resizeTimer = useRef<number>(0)
  const handleResize = useCallback(() => {
    window.clearTimeout(resizeTimer.current)
    resizeTimer.current = window.setTimeout(() => {
      setSidebarOpen(window.innerWidth >= 1024)
    }, 100)
  }, [setSidebarOpen])

  useEffect(() => {
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.clearTimeout(resizeTimer.current)
    }
  }, [handleResize])

  return (
    <div className={cn("flex h-full", roleName === 'field_staff' && 'staff-light-mode')}>
      <BillingSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="lg:hidden">
          <AppHeader />
        </div>

        <div className="hidden lg:block">
          <DesktopFilterBar />
        </div>

        <main className="flex-1 overflow-hidden relative z-0">
          {children}
        </main>

        {/* Bottom tab bar — mobile only */}
        <nav className="flex items-center justify-around border-t bg-card shrink-0 safe-area-bottom lg:hidden">
          {tabs.map((tab) => {
            const isActive = tab.href ? pathname === tab.href : activeView === tab.id
            if (tab.id === 'scan') {
              return (
                <button
                  key={tab.id}
                  onClick={openScanner}
                  className="flex flex-col items-center justify-center min-h-[48px] min-w-[44px]"
                >
                  <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg border-2 border-background flex items-center justify-center transition-transform active:scale-95">
                    <QrCode className="h-5 w-5" />
                  </div>
                </button>
              )
            }
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.href) router.push(tab.href)
                  else {
                    setView(tab.id as 'map' | 'list' | 'stats' | 'data-insight' | 'detail')
                    if (pathname !== '/map') router.push('/map')
                  }
                }}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 px-3 min-w-0 min-h-[48px] justify-center transition-colors cursor-pointer",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className={cn("h-5 w-5", isActive && "fill-primary/10")} />
                <span className="text-[10px] font-semibold">{tab.label}</span>
              </button>
            )
          })}
        </nav>

        {/* QR Scanner Modal */}
        {showScanner && (
          <div className="fixed inset-0 z-[1000] bg-black flex flex-col lg:hidden">
            <div className="flex items-center justify-between px-4 py-3 text-white shrink-0">
              <span className="text-sm font-semibold">Scan Bill QR Code</span>
              <button onClick={handleCloseScanner} className="p-2 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-4">
              {!isScanning && !scanError && (
                <div className="text-center space-y-4">
                  <div className="w-24 h-24 mx-auto rounded-2xl bg-white/10 flex items-center justify-center">
                    <Scan className="h-10 w-10 text-white/60" />
                  </div>
                  <p className="text-sm text-white/60 max-w-xs">
                    Point your camera at the QR code on the physical bill
                  </p>
                  <button
                    onClick={startScanner}
                    className="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-semibold cursor-pointer min-h-[44px]"
                  >
                    Start Camera
                  </button>
                </div>
              )}

              <div id="qr-reader-shell" className={`${isScanning && !scanError ? '' : 'hidden'} w-full max-w-sm`} />
            </div>

            {isScanning && (
              <div className="shrink-0 pb-4 flex items-center justify-center gap-2 text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Scanning...</span>
              </div>
            )}

            {scanError && (
              <div className="shrink-0 px-4 pb-4 space-y-3">
                <p className="text-sm text-red-400 text-center">{scanError}</p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={startScanner}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold cursor-pointer min-h-[44px]"
                  >
                    Retry
                  </button>
                  <input
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder="Manual survey ID"
                    className="px-3 py-2 rounded-lg bg-white/10 text-white text-sm placeholder-white/40 border border-white/20 min-w-0 max-w-32"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleManualSubmit()
                    }}
                  />
                  <button
                    onClick={handleManualSubmit}
                    disabled={!manualInput.trim()}
                    className="px-3 py-2 bg-white/20 text-white rounded-lg text-sm font-semibold cursor-pointer min-h-[44px] disabled:opacity-40"
                  >
                    Go
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
