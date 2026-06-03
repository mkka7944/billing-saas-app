'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingStore } from '@/stores/billing-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { BillingSidebar } from './BillingSidebar'
import { AppHeader } from './AppHeader'
import { DesktopFilterBar } from '@/components/filter-panel'
import { MapIcon, List, Truck, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const roleName = useAuthStore((s) => s.roleName)
  const activeView = useBillingStore((s) => s.activeView)
  const setView = useBillingStore((s) => s.setView)
  const { setSidebarOpen } = useBillingUIStore()

  // Bottom tabs — keep only core views; everything else goes in sidebar
  const tabs = [
    { id: 'map' as const, label: 'Map', icon: MapIcon, href: undefined as string | undefined },
    { id: 'list' as const, label: 'List', icon: List, href: undefined as string | undefined },
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
                  "flex flex-col items-center gap-0.5 py-2 px-4 min-w-0 min-h-[48px] justify-center transition-colors cursor-pointer",
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
      </div>
    </div>
  )
}
