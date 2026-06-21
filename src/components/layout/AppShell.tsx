'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingStore, CITY_CONFIG } from '@/stores/billing-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { useNavStore } from '@/stores/navigation-store'
import { BillingSidebar } from './BillingSidebar'
import { AppHeader } from './AppHeader'
import { PageLoader } from '@/components/page-loader'
import { DesktopFilterBar } from '@/components/filter-panel'
import { MapIcon, List, Truck, BarChart3, QrCode, X, Loader2, Scan } from 'lucide-react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
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
  const staffMode = useBillingStore((s) => s.staffMode)
  const { setSidebarOpen } = useBillingUIStore()

  const queryClient = useQueryClient()

  // Auto-select assigned city for field staff on mount (skip if already set)
  useEffect(() => {
    if (roleName === 'field_staff' && assignedCity) {
      const cfg = CITY_CONFIG[assignedCity]
      if (cfg) setCity(assignedCity, cfg.district, cfg.tehsil)
    }
  }, [roleName, assignedCity, setCity])

  // QR scanner state
  const [showScanner, setShowScanner] = useState(false)
  const [scanItems, setScanItems] = useState<AssignmentItemWithUnit[]>([])
  const scanItemsRef = useRef<AssignmentItemWithUnit[]>([])
  scanItemsRef.current = scanItems
  const [scanError, setScanError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
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
    setScanLoading(false)
    setManualInput('')
    setScanItems([])
  }, [stopScanner])

  const startScanner = useCallback(async () => {
    setScanError(null)
    setIsScanning(true)

    // Brief delay to stabilize camera init on Samsung Chrome
    await new Promise((r) => setTimeout(r, 500))

    const scanner = new Html5Qrcode('qr-reader-shell')
    scannerRef.current = scanner
    try {
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 20,
          qrbox: (vw: number, vh: number) => {
            const size = Math.floor(Math.min(vw, vh) * 0.7)
            return { width: size, height: size }
          },
          aspectRatio: 1.777778,
          experimentalFeatures: { useBarCodeDetectorIfSupported: false },
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        } as any,
        (decodedText) => {
          const raw = decodedText.substring(0, 80)
          let surveyId: string | null = null
          const sidMatch = decodedText.match(/sid=([A-Za-z0-9_-]+)/)
          if (sidMatch) {
            surveyId = sidMatch[1]
          } else {
            const plainNum = decodedText.match(/(\d{5,10})/)
            if (plainNum) surveyId = plainNum[1]
          }
          if (!surveyId) {
            stopScanner()
            setScanError(`No survey ID found in QR: "${raw}"`)
            return
          }
          const matched = scanItemsRef.current.find((i) => i.survey_id === surveyId || i.unit?.survey_id === surveyId)
          if (!matched) {
            stopScanner()
            setScanError(`Unrecognized bill: "${raw}" (ID: ${surveyId})`)
            return
          }
          if (matched.deliveredByOther) {
            stopScanner()
            setScanError(`Bill already delivered by ${matched.deliveredByStaffName || 'another staff member'}`)
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

      // Apply continuous focus and zoom after camera stabilizes
      setTimeout(async () => {
        try {
          if (scannerRef.current) {
            await scannerRef.current.applyVideoConstraints({
              focusMode: 'continuous',
              advanced: [{ zoom: 1.5 } as any],
            } as MediaTrackConstraints)
          }
        } catch {}
      }, 2000)
    } catch (e) {
      if (mountedRef.current) {
        setScanError(`Camera error: ${(e as Error).message}`)
        setIsScanning(false)
      }
    }
  }, [stopScanner, router])

  const openScanner = useCallback(async () => {
    setShowScanner(true)
    setScanError(null)
    setIsScanning(false)
    setScanLoading(true)
    setManualInput('')
    setScanItems([])
    const user = useAuthStore.getState().user
    if (!user?.id) return
    try {
      // Read from React Query cache first (loaded by deliver/map page)
      const cached = queryClient.getQueryData(['staff-assignment', user.id]) as { items?: AssignmentItemWithUnit[] } | undefined
      if (cached?.items?.length) {
        setScanItems(cached.items)
      } else {
        const res = await fetch(`/api/assignments?staff_id=${user.id}`)
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
        setScanItems(data.items || [])
      }
    } catch {
      setScanError('Could not load assignment data')
    } finally {
      setScanLoading(false)
    }
  }, [])

  const handleManualSubmit = useCallback(() => {
    const sid = manualInput.trim()
    if (!sid) return
    const matched = scanItemsRef.current.find((i) => i.survey_id === sid || i.unit?.survey_id === sid)
    if (!matched) {
      setScanError(`No assignment matches survey ID: ${sid}`)
      return
    }
    handleCloseScanner()
    router.push(`/map?target=${encodeURIComponent(matched.psid)}`)
  }, [manualInput, handleCloseScanner, router])

  // Bottom tabs — keep only core views; everything else goes in sidebar
  const tabs = [
    { id: 'map' as const, label: 'Map', icon: MapIcon, href: undefined as string | undefined },
    ...(!(roleName === 'field_staff' && staffMode === 'delivery')
      ? [{ id: 'list' as const, label: 'List', icon: List, href: undefined as string | undefined }]
      : []),
    { id: 'scan' as const, label: 'SCAN', icon: QrCode, href: undefined as string | undefined },
    ...(!(roleName === 'field_staff' && staffMode === 'browse')
      ? [{ id: 'deliver' as const, label: 'Deliver', icon: Truck, href: '/deliver' as string | undefined }]
      : []),
    { id: 'stats' as const, label: 'Stats', icon: BarChart3, href: '/stats' as string | undefined },
  ]

  // Debounced resize handler
  const resizeTimer = useRef<number>(0)
  const [pulsingTab, setPulsingTab] = useState<string | null>(null)
  const isNavigating = useNavStore((s) => s.isNavigating)
  const [showPageLoader, setShowPageLoader] = useState(false)

  useEffect(() => {
    if (isNavigating) {
      const timer = setTimeout(() => setShowPageLoader(true), 300)
      return () => clearTimeout(timer)
    }
    setShowPageLoader(false)
  }, [isNavigating])
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
    <div className="flex h-full">
      <BillingSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="lg:hidden">
          <AppHeader />
        </div>

        <div className="hidden lg:block">
          <DesktopFilterBar />
        </div>

        <main className="flex-1 overflow-hidden relative">
          {children}
        </main>

        {/* Bottom tab bar — mobile only */}
        <nav className="flex items-center justify-around border-t bg-card shrink-0 safe-area-bottom lg:hidden">
          {tabs.map((tab) => {
            const isActive = tab.href ? pathname === tab.href : activeView === tab.id
            const isPulsing = pulsingTab === tab.id
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
                  setPulsingTab(tab.id)
                  setTimeout(() => setPulsingTab(null), 1500)
                  useNavStore.getState().start()
                  if (tab.href) router.push(tab.href)
                  else {
                    setView(tab.id as 'map' | 'list' | 'stats' | 'data-insight' | 'detail')
                    if (pathname !== '/map') router.push('/map')
                  }
                }}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 py-2 px-3 min-w-0 min-h-[48px] justify-center transition-colors cursor-pointer",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className={cn(
                  "h-5 w-5",
                  isActive && "fill-primary/30",
                  isPulsing && "animate-pulse-subtle"
                )} />
                <span className="text-[10px] font-semibold">{tab.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-1/4 w-1/2 h-0.5 bg-primary rounded-full" />
                )}
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
                  {scanLoading ? (
                    <div className="flex items-center justify-center gap-2 text-white/60">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-sm">Loading assignment data...</span>
                    </div>
                  ) : (
                    <button
                      onClick={startScanner}
                      className="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-semibold cursor-pointer min-h-[44px]"
                    >
                      Start Camera
                    </button>
                  )}
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

      <PageLoader visible={showPageLoader} />
    </div>
  )
}
