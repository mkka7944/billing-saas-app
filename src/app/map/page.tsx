'use client'

import { useAuthStore } from '@/stores/auth-store'
import { useBillingStore } from '@/stores/billing-store'
import { BillingFilters } from '@/components/billing-filters'
import { SurveyList } from '@/components/survey-list'
import { MapView } from '@/components/map-view'
import { RouteNavigator } from '@/components/route-navigator'
import { KpiCards } from '@/components/kpi-cards'
import { HouseDetailSheet } from '@/components/house-detail-sheet'
import { Button } from '@/components/ui/button'
import { MapIcon, List, Route, BarChart3, LogOut } from 'lucide-react'

export default function MapPage() {
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const activeView = useBillingStore((s) => s.activeView)
  const selectedHouseId = useBillingStore((s) => s.selectedHouseId)
  const setView = useBillingStore((s) => s.setView)

  if (!user) return null

  return (
    <div className="flex flex-col flex-1 h-screen">
      <header className="flex items-center justify-between px-3 py-1.5 border-b bg-card shrink-0">
        <h1 className="text-sm font-semibold">TMT Billing</h1>
        <div className="flex items-center gap-1">
          <Button variant={activeView === 'map' ? 'default' : 'ghost'} size="sm" onClick={() => setView('map')}>
            <MapIcon className="h-4 w-4" />
          </Button>
          <Button variant={activeView === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setView('list')}>
            <List className="h-4 w-4" />
          </Button>
          <Button variant={activeView === 'route' ? 'default' : 'ghost'} size="sm" onClick={() => setView('route')}>
            <Route className="h-4 w-4" />
          </Button>
          <Button variant={activeView === 'stats' ? 'default' : 'ghost'} size="sm" onClick={() => setView('stats')}>
            <BarChart3 className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <span className="text-xs text-muted-foreground mr-2 hidden sm:inline">{user.email}</span>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <BillingFilters />

      <div className="flex-1 relative">
        {activeView === 'map' && <MapView />}
        {activeView === 'list' && <SurveyList />}
        {activeView === 'route' && <RouteNavigator />}
        {activeView === 'stats' && <KpiCards />}
        {activeView === 'detail' && selectedHouseId && <HouseDetailSheet />}
      </div>
    </div>
  )
}
