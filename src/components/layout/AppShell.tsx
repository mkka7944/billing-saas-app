'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingStore } from '@/stores/billing-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { BillingSidebar } from './BillingSidebar'
import { Button } from '@/components/ui/button'
import { MapIcon, List, Route, BarChart3, LogOut, Building2, Layers, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { id: 'map' as const, label: 'Map', icon: MapIcon },
  { id: 'list' as const, label: 'List', icon: List },
  { id: 'route' as const, label: 'Route', icon: Route },
  { id: 'stats' as const, label: 'Stats', icon: BarChart3 },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const activeView = useBillingStore((s) => s.activeView)
  const setView = useBillingStore((s) => s.setView)
  const mapType = useBillingStore((s) => s.mapType)
  const setMapType = useBillingStore((s) => s.setMapType)
  const { setSidebarOpen, toggleSidebar } = useBillingUIStore()

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
        <header className="flex items-center justify-between px-3 py-2 border-b bg-card shrink-0 lg:hidden">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={toggleSidebar} className="h-8 w-8 p-0">
              <Menu className="h-4 w-4" />
            </Button>
            <Building2 className="h-5 w-5 text-primary shrink-0" />
            <span className="text-sm font-bold tracking-tight">TMT Billing</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[160px]">
              {user?.email}
            </span>
            <Button
              variant={mapType === 'satellite' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMapType(mapType === 'streets' ? 'satellite' : 'streets')}
              className="h-8 w-8 p-0"
              title={mapType === 'streets' ? 'Satellite view' : 'Street view'}
            >
              <Layers className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="h-8 w-8 p-0">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden animate-in fade-in duration-500">
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
