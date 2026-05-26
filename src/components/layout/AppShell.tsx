'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingStore } from '@/stores/billing-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { BillingSidebar } from './BillingSidebar'
import { AppHeader } from './AppHeader'
import { DesktopFilterBar } from '@/components/filter-panel'
import { MapIcon, List, BarChart3, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const role = useAuthStore((s) => s.role)
  const activeView = useBillingStore((s) => s.activeView)
  const setView = useBillingStore((s) => s.setView)
  const { setSidebarOpen } = useBillingUIStore()

  const isMapPage = pathname === '/map'

  const tabs = [
    { id: 'map' as const, label: 'Map', icon: MapIcon },
    { id: 'list' as const, label: 'List', icon: List },
    { id: 'stats' as const, label: 'Dashboard', icon: BarChart3 },
    ...(role === 'admin'
      ? [{ id: 'data-insight' as const, label: 'Insight', icon: FileSpreadsheet }]
      : []),
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
    <div className="flex h-full">
      <div className="hidden lg:flex">
        <BillingSidebar />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="lg:hidden">
          <AppHeader />
        </div>

        {isMapPage && (
          <div className="hidden lg:block">
            <DesktopFilterBar />
          </div>
        )}

        <main className="flex-1 overflow-hidden">
          {children}
        </main>

        {/* Bottom tab bar — only on /map pages where activeView applies */}
        {isMapPage && (
          <nav className="flex items-center justify-around border-t bg-card shrink-0 safe-area-bottom lg:hidden">
            {tabs.map((tab) => {
              const isActive = activeView === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setView(tab.id)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2 px-4 min-w-0 transition-colors cursor-pointer",
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
        )}
      </div>
    </div>
  )
}
