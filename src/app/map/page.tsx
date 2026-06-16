'use client'

import { useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useBillingStore } from '@/stores/billing-store'
import { useAuthStore } from '@/stores/auth-store'
import { useStaffAssignment } from '@/hooks/use-assignments'
import { SurveyList } from '@/components/survey-list'
import { MapView } from '@/components/map-view'
import { Dashboard } from '@/components/dashboard'
import { HouseDetailSheet } from '@/components/house-detail-sheet'
import { DataInsight } from '@/components/data-insight'
import { AppShell } from '@/components/layout/AppShell'
import { FloatingActions } from '@/components/layout/floating-actions'
import { MapMarkerCount } from '@/components/map-marker-count'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { cn } from '@/lib/utils'
import UnitDeliverySheet from '@/components/delivery/unit-delivery-sheet'
import QRScannerButton from '@/components/delivery/qr-scanner-button'
import { useUserLocation } from '@/hooks/use-user-location'
import type { AssignmentItemWithUnit } from '@/types'

const StaffMap = dynamic(
  () => import('@/components/delivery/staff-map'),
  { ssr: false }
)

export default function MapPage() {
  const activeView = useBillingStore((s) => s.activeView)
  const selectedHouseId = useBillingStore((s) => s.selectedHouseId)
  const deliverTargetId = useBillingStore((s) => s.deliverTargetId)
  const deliverTargetUnit = useBillingStore((s) => s.deliverTargetUnit)
  const deliverableList = useBillingStore((s) => s.deliverableList)
  const setDeliverTarget = useBillingStore((s) => s.setDeliverTarget)
  const setDeliverableList = useBillingStore((s) => s.setDeliverableList)
  const nextDeliverable = useBillingStore((s) => s.nextDeliverable)
  const prevDeliverable = useBillingStore((s) => s.prevDeliverable)
  const selectHouse = useBillingStore((s) => s.selectHouse)
  const mapMarkers = useBillingStore((s) => s.mapMarkers)
  const houseSource = useBillingStore((s) => s.houseSource)
  const setHouseSource = useBillingStore((s) => s.setHouseSource)
  const staffMode = useBillingStore((s) => s.staffMode)
  const setPageIdentity = useBillingUIStore((s) => s.setPageIdentity)
  const roleName = useAuthStore((s) => s.roleName)
  const user = useAuthStore((s) => s.user)
  const { location: userLocation } = useUserLocation()

  useEffect(() => { setPageIdentity('Map') }, [setPageIdentity])

  // Read ?target=PSID from URL (passed from /deliver page) on initial mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const target = params.get('target')
    if (target && !deliverTargetId) {
      setDeliverTarget(target)
      const url = new URL(window.location.href)
      url.searchParams.delete('target')
      window.history.replaceState({}, '', url.toString())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch staff assignment items for field_staff role
  const { data: staffData } = useStaffAssignment(
    roleName === 'field_staff' ? user?.id || null : null
  )
  const staffItems = useMemo(() => (staffData?.items as unknown as AssignmentItemWithUnit[]) || [], [staffData])

  // For field_staff: populate deliverableList from staffItems so prev/next works
  useEffect(() => {
    if (roleName !== 'field_staff') return
    const list = staffItems
      .map((i) => i.unit)
      .filter((u): u is NonNullable<typeof u> => u !== null)
    setDeliverableList(list)
  }, [roleName, staffItems, staffMode, setDeliverableList])

  // When deliverableList updates (e.g., staff data loads), sync deliverTargetUnit
  // if there is a pending targetId from the URL param that has no unit yet
  useEffect(() => {
    if (!deliverTargetId || deliverTargetUnit) return
    const item = deliverableList.find((u) => u.psid === deliverTargetId)
    if (item) {
      setDeliverTarget(deliverTargetId, item)
    }
  }, [deliverTargetId, deliverTargetUnit, deliverableList, setDeliverTarget])

  // Find the matching assignment item (only for staff with assignment) to get the assignment_item_id
  const deliveryItem = useMemo(() => {
    if (!deliverTargetId || roleName !== 'field_staff') return null
    return staffItems.find((i) => i.psid === deliverTargetId) || null
  }, [deliverTargetId, staffItems, roleName])

  const deliveryUnit = deliverTargetUnit
  const deliveryItemId = deliveryItem?.id || null

  const handleQRScanned = (psid: string) => {
    const item = staffItems.find((i) => i.psid === psid)
    if (item) {
      setDeliverTarget(item.psid, item.unit)
    }
  }

  // Filter reactivity: when mapMarkers change and HDS is open from map view,
  // keep HDS in sync with current marker set; close if current unit is filtered out
  useEffect(() => {
    if (houseSource !== 'map' || !selectedHouseId) return
    if (mapMarkers.length === 0) return
    const stillVisible = mapMarkers.some((m) => m.survey_id === selectedHouseId)
    if (!stillVisible) {
      selectHouse(null)
    }
  }, [mapMarkers, selectedHouseId, houseSource, selectHouse])

  const hdsLayoutMode: 'fixed-list' | 'sliding' = activeView === 'list' ? 'fixed-list' : 'sliding'

  return (
    <AppShell>
      <FloatingActions />
      <div className="flex flex-col lg:flex-row h-full">
        <div className="flex-1 relative min-h-0 min-w-0 h-full">
          <MapMarkerCount staffCount={roleName === 'field_staff' && staffMode === 'delivery' ? staffItems.length : undefined} />
          {/* Map layer — always rendered, stays hidden via opacity (Leaflet needs layout) */}
          <div className={cn(activeView !== 'map' && 'invisible pointer-events-none', 'absolute inset-0')}>
            {roleName === 'field_staff' && staffMode === 'delivery' ? (
              <StaffMap items={staffItems} userLocation={userLocation} />
            ) : (
              <MapView />
            )}
          </div>
          {activeView === 'list' && (
            <div className="absolute inset-0 bg-background z-10 overflow-auto">
              <SurveyList />
            </div>
          )}
          {activeView === 'stats' && (
            <div className="absolute inset-0 bg-background z-10 overflow-auto">
              <Dashboard />
            </div>
          )}
          {activeView === 'data-insight' && (
            <div className="absolute inset-0 bg-background z-10 overflow-auto">
              <DataInsight />
            </div>
          )}

          {/* UnitDeliverySheet overlay — universal action sheet (staff + admin) */}
          {activeView === 'map' && deliverTargetId && deliveryUnit && (
            <UnitDeliverySheet
              unit={deliveryUnit}
              assignmentItemId={deliveryItemId}
              itemStatus={deliveryItem?.status || null}
              initialLat={userLocation?.lat}
              initialLng={userLocation?.lng}
              onViewDetails={() => {
                setDeliverTarget(null, null)
                const unitSurveyId = deliveryUnit?.survey_id
                if (unitSurveyId) {
                  selectHouse(unitSurveyId, mapMarkers)
                  setHouseSource('map')
                }
              }}
              onClose={() => setDeliverTarget(null)}
              onPrev={prevDeliverable}
              onNext={nextDeliverable}
            />
          )}

          {/* QR scanner — desktop only (mobile uses bottom bar button) */}
          {roleName === 'field_staff' && activeView === 'map' && (
            <div className="hidden lg:block">
              <QRScannerButton
                items={staffItems}
                onUnitScanned={handleQRScanned}
              />
            </div>
          )}


        </div>

        {/* HDS — right panel on desktop / full-screen overlay on mobile */}
        {selectedHouseId && <HouseDetailSheet layoutMode={hdsLayoutMode} />}
      </div>
    </AppShell>
  )
}
