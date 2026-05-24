'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingStore } from '@/stores/billing-store'

import { SurveyList } from '@/components/survey-list'
import { MapView } from '@/components/map-view'
import { RouteNavigator } from '@/components/route-navigator'
import { KpiCards } from '@/components/kpi-cards'
import { HouseDetailSheet } from '@/components/house-detail-sheet'
import { DataInsight } from '@/components/data-insight'
import { AppShell } from '@/components/layout/AppShell'

export default function MapPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const activeView = useBillingStore((s) => s.activeView)
  const selectedHouseId = useBillingStore((s) => s.selectedHouseId)

  useEffect(() => {
    if (!user) router.replace('/login')
  }, [user, router])

  if (!user) return null

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        <div className="flex-1 relative">
          {activeView === 'map' && <MapView />}
          {activeView === 'list' && <SurveyList />}
          {activeView === 'route' && <RouteNavigator />}
          {activeView === 'stats' && <KpiCards />}
          {activeView === 'detail' && selectedHouseId && <HouseDetailSheet />}
          {activeView === 'data-insight' && <DataInsight />}
        </div>
      </div>
    </AppShell>
  )
}
