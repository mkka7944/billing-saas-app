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
import { useBillingUIStore } from '@/stores/billing-ui-store'
import UnitDeliverySheet from '@/components/delivery/unit-delivery-sheet'
import QRScannerButton from '@/components/delivery/qr-scanner-button'
import { usePhotoQueue } from '@/hooks/use-photo-queue'
import type { AssignmentItemWithUnit } from '@/types'

const StaffMap = dynamic(
  () => import('@/components/delivery/staff-map'),
  { ssr: false }
)

export default function MapPage() {
  const activeView = useBillingStore((s) => s.activeView)
  const selectedHouseId = useBillingStore((s) => s.selectedHouseId)
  const deliverTargetId = useBillingStore((s) => s.deliverTargetId)
  const setDeliverTarget = useBillingStore((s) => s.setDeliverTarget)
  const selectHouse = useBillingStore((s) => s.selectHouse)
  const setPageIdentity = useBillingUIStore((s) => s.setPageIdentity)
  const roleName = useAuthStore((s) => s.roleName)
  const user = useAuthStore((s) => s.user)
  const { enqueuePhoto } = usePhotoQueue()

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

  // Find the delivery target unit
  const deliveryItem = useMemo(() => {
    if (!deliverTargetId || roleName !== 'field_staff') return null
    return staffItems.find((i) => i.psid === deliverTargetId) || null
  }, [deliverTargetId, staffItems, roleName])

  const deliveryUnit = deliveryItem?.unit || null
  const deliveryItemId = deliveryItem?.id || null

  const handleDeliver = async (itemId: string, dataUrl: string) => {
    await enqueuePhoto({
      assignmentItemId: itemId,
      psid: deliveryUnit?.psid || '',
      dataUrl,
      email: user?.email || '',
    })
    setDeliverTarget(null)
  }

  const handleQRScanned = (psid: string) => {
    const item = staffItems.find((i) => i.psid === psid)
    if (item) {
      setDeliverTarget(item.psid)
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        <div className="flex-1 relative min-h-0 h-full">
          {activeView === 'map' && (roleName === 'field_staff' ? (
            <StaffMap items={staffItems} />
          ) : (
            <MapView />
          ))}
          {activeView === 'list' && <SurveyList />}
          {activeView === 'stats' && <Dashboard />}
          {activeView === 'detail' && selectedHouseId && <HouseDetailSheet />}
          <div className={activeView !== 'data-insight' ? 'hidden' : 'absolute inset-0'}>
            <DataInsight />
          </div>

          {/* UnitDeliverySheet overlay — staff delivery flow */}
          {activeView === 'map' && deliverTargetId && deliveryUnit && (
            <UnitDeliverySheet
              unit={deliveryUnit}
              assignmentItemId={deliveryItemId}
              onDeliver={handleDeliver}
              onViewDetails={() => {
                setDeliverTarget(null)
                const unitSurveyId = deliveryUnit?.survey_id
                if (unitSurveyId) selectHouse(unitSurveyId)
              }}
              onClose={() => setDeliverTarget(null)}
              onPrev={deliverTargetId && roleName === 'field_staff' ? () => {
                const idx = staffItems.findIndex((i) => i.psid === deliverTargetId)
                if (idx > 0) setDeliverTarget(staffItems[idx - 1].psid)
              } : undefined}
              onNext={deliverTargetId && roleName === 'field_staff' ? () => {
                const idx = staffItems.findIndex((i) => i.psid === deliverTargetId)
                if (idx < staffItems.length - 1) setDeliverTarget(staffItems[idx + 1].psid)
              } : undefined}
            />
          )}

          {/* QR scanner — visible on map for staff */}
          {roleName === 'field_staff' && activeView === 'map' && (
            <QRScannerButton
              items={staffItems}
              onUnitScanned={handleQRScanned}
            />
          )}

          {/* DEBUG badge — shows condition states for sheet rendering */}
          <div className="absolute top-2 right-2 z-[9999] bg-black/80 text-white text-[10px] p-2 rounded font-mono leading-relaxed pointer-events-none">
            <div>activeView={activeView}</div>
            <div>deliverTargetId={deliverTargetId ? '✓' : '✗'}</div>
            <div>deliveryUnit={deliveryUnit ? '✓' : '✗'}</div>
            <div>roleName={roleName}</div>
            <div>staffItems={staffItems.length}</div>
            <div>match={deliveryItem ? '✓' : '✗'}</div>
          </div>

          {/* DEBUG indicator — confirms sheet component renders */}
          {activeView === 'map' && deliverTargetId && deliveryUnit && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-[9999] bg-green-600 text-white text-xs font-bold px-3 py-1 rounded shadow-lg">
              SHEET RENDERED ✓ (should appear below)
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
