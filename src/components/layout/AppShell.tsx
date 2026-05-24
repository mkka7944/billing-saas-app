'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingStore } from '@/stores/billing-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { BillingSidebar } from './BillingSidebar'
import { Button } from '@/components/ui/button'
import { DesktopFilterBar, MobileFilterSheet } from '@/components/filter-panel'
import { MapIcon, List, Route, BarChart3, LogOut, Building2, Layers, Menu, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const role = useAuthStore((s) => s.role)
  const signOut = useAuthStore((s) => s.signOut)
  const activeView = useBillingStore((s) => s.activeView)
  const setView = useBillingStore((s) => s.setView)
  const goBack = useBillingStore((s) => s.goBack)
  const navHistory = useBillingStore((s) => s.navHistory)
  const mapType = useBillingStore((s) => s.mapType)
  const setMapType = useBillingStore((s) => s.setMapType)
  const { setSidebarOpen, toggleSidebar } = useBillingUIStore()

  const tabs = [
    { id: 'map' as const, label: 'Map', icon: MapIcon },
    { id: 'list' as const, label: 'List', icon: List },
    { id: 'route' as const, label: 'Route', icon: Route },
    { id: 'stats' as const, label: 'Stats', icon: BarChart3 },
    ...(role === 'admin'
      ? [{ id: 'data-insight' as const, label: 'Insight', icon: FileSpreadsheet }]
      : []),
  ]

  useEffect(() => {
    const handleResize = () => {
      setSidebarOpen(window.innerWidth >= 1024)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [setSidebarOpen])

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  return (
    <div className="flex h-full">
      {/* Sidebar — visible on lg+ */}
      <div className="hidden lg:flex">
        <BillingSidebar />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header — visible on mobile only */}
        {/* Mobile header — visible on mobile only */}
        <header className="flex items-center justify-between px-2 py-1.5 border-b bg-card shrink-0 lg:hidden min-h-[44px]">
          <div className="flex items-center gap-1">
            {navHistory.length > 0 && activeView !== 'detail' && activeView !== 'route' ? (
              <button onClick={goBack} className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer" aria-label="Back">
                <span className="text-xl leading-none">‹</span>
              </button>
            ) : (
              <button onClick={toggleSidebar} className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer" aria-label="Menu">
                <Menu className="h-4 w-4" />
              </button>
            )}
            <div className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs font-bold tracking-tight">TMT</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/50 max-w-[140px]">
              <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-[9px] font-black text-primary">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <span className="text-[10px] font-medium text-muted-foreground truncate">
                {user?.email?.split('@')[0] || ''}
              </span>
            </div>
            <MobileFilterSheet />
            <button
              onClick={() => setMapType(mapType === 'streets' ? 'satellite' : 'streets')}
              className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer"
              title={mapType === 'streets' ? 'Satellite' : 'Street'}
            >
              <Layers className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Desktop filter bar — visible on desktop only */}
        <div className="hidden lg:block">
          <DesktopFilterBar />
        </div>

        <main className="flex-1 overflow-hidden">
          {children}
        </main>

        {/* Bottom tab bar — visible on mobile only */}
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
      </div>
    </div>
  )
}
