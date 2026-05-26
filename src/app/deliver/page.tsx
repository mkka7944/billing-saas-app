'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useStaffAssignment, useMarkItem } from '@/hooks/use-assignments'
import { usePhotoQueue } from '@/hooks/use-photo-queue'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { cacheAssignment, getCachedAssignment } from '@/lib/offline-cache'
import dynamic from 'next/dynamic'
import { Upload, Loader2, Map, List, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssignmentItemWithUnit } from '@/types'
import DeliverCardList from '@/components/delivery/deliver-card-list'
import { AppHeader } from '@/components/layout/AppHeader'
import { useBillingUIStore } from '@/stores/billing-ui-store'

const DeliverMap = dynamic(
  () => import('@/components/delivery/deliver-map'),
  { ssr: false }
)

const DeliverBottomSheet = dynamic(
  () => import('@/components/delivery/deliver-bottom-sheet'),
  { ssr: false }
)

type ViewMode = 'map' | 'list'

export default function DeliverPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const setPageIdentity = useBillingUIStore((s) => s.setPageIdentity)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({})
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('map')
  const [useCache, setUseCache] = useState(false)
  const [panTo, setPanTo] = useState<[number, number] | null>(null)

  const { data, isLoading, refetch, isRefetching } = useStaffAssignment(user?.id || null)
  const { queueCount, isProcessing, enqueuePhoto, lastError } = usePhotoQueue()
  const markItem = useMarkItem()
  const isOnline = useOnlineStatus()

  useEffect(() => { setPageIdentity('Deliver') }, [setPageIdentity])

  // Cache data on successful fetch
  useEffect(() => {
    if (data?.items) {
      cacheAssignment(data.data as unknown as Record<string, unknown> | null, data.items as unknown as Record<string, unknown>[])
      setUseCache(false)
    }
  }, [data])

  // Fall back to cache when offline and no data
  useEffect(() => {
    if (!isLoading && !data && !isOnline) {
      const cached = getCachedAssignment()
      if (cached) {
        setUseCache(true)
      }
    }
  }, [isLoading, data, isOnline])

  useEffect(() => {
    if (!user) router.replace('/login')
  }, [user, router])

  // Use cached data as fallback
  const cached = useCache ? getCachedAssignment() : null
  const displayData = cached
    ? { data: cached.data, items: cached.items }
    : data

  const items: AssignmentItemWithUnit[] = (displayData?.items as unknown as AssignmentItemWithUnit[]) || []
  const assignment = displayData?.data as unknown as Record<string, unknown> | null
  const deliveredCount = items.filter((i) => i.status === 'delivered').length

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id)
    setPanTo(null)
    setViewMode('map')
  }, [])

  const handlePhotoCapture = useCallback(async (dataUrl: string) => {
    if (!selectedId) return
    const item = items.find((i) => i.id === selectedId)
    if (!item || !user?.email) return

    setPhotoPreviews((prev) => ({ ...prev, [selectedId]: dataUrl }))
    setUploadingId(selectedId)

    try {
      await enqueuePhoto({
        assignmentItemId: item.id,
        psid: item.psid,
        dataUrl,
        email: user.email,
      })
    } finally {
      setUploadingId(null)
    }
  }, [selectedId, items, enqueuePhoto, user?.email])

  const captureGps = useCallback((): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null)
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000, enableHighAccuracy: true }
      )
    })
  }, [])

  const advanceToNext = useCallback((currentId: string) => {
    const pending = [...items]
      .filter((i) => i.status === 'pending' && i.id !== currentId)
      .sort((a, b) => (a.route_seq || 0) - (b.route_seq || 0))
    if (pending.length > 0) {
      const next = pending[0]
      setSelectedId(next.id)
      if (next.unit?.lat != null && next.unit?.lng != null) {
        setPanTo([next.unit.lat, next.unit.lng])
      }
    }
  }, [items])

  const handleMarkDelivered = useCallback(async () => {
    if (!selectedId) return
    const currentId = selectedId
    const gps = await captureGps()
    markItem.mutate(
      { id: currentId, status: 'delivered', gps_lat: gps?.lat, gps_lng: gps?.lng },
      { onSuccess: () => advanceToNext(currentId) }
    )
  }, [selectedId, captureGps, markItem, advanceToNext])

  const handleMarkMissed = useCallback(async (reason: string) => {
    if (!selectedId) return
    const currentId = selectedId
    const gps = await captureGps()
    markItem.mutate(
      { id: currentId, status: 'missed', gps_lat: gps?.lat, gps_lng: gps?.lng, notes: reason },
      { onSuccess: () => advanceToNext(currentId) }
    )
  }, [selectedId, captureGps, markItem, advanceToNext])

  if (!user) return null

  const selectedItem = items.find((i) => i.id === selectedId) || null
  const selectedPreview = selectedId ? photoPreviews[selectedId] : undefined
  const isUploading = uploadingId === selectedId

  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
      {/* Error banner */}
      {lastError && (
        <div className="h-8 shrink-0 flex items-center justify-center bg-destructive/10 text-destructive text-xs font-medium px-4">
          {lastError}
        </div>
      )}

      <AppHeader
        title={viewMode === 'list' ? 'All Items' : 'Deliver'}
        forceBack
        onBack={() => router.push('/map')}
        actions={
          <div className="flex items-center gap-2">
            {!isOnline && (
              <span className="text-[10px] text-amber-600 flex items-center gap-1 font-medium">
                <WifiOff className="h-3 w-3" />
                Offline
              </span>
            )}
            {assignment && (
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                <button
                  onClick={() => setViewMode('map')}
                  className={cn(
                    'h-7 w-7 flex items-center justify-center rounded-md text-[10px] cursor-pointer',
                    viewMode === 'map' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Map className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'h-7 w-7 flex items-center justify-center rounded-md text-[10px] cursor-pointer',
                    viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {queueCount > 0 && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                {isProcessing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                {queueCount}
              </span>
            )}
          </div>
        }
      />

      {/* Map area */}
      {isLoading && !useCache ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-sm text-muted-foreground">Loading assignment...</div>
        </div>
      ) : !assignment && !useCache ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="text-4xl">📋</div>
          <p className="text-sm font-medium">No assignment for today</p>
          <p className="text-xs text-muted-foreground">
            Your supervisor has not assigned any bills for delivery today.
          </p>
        </div>
      ) : !assignment && useCache ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <p className="text-sm font-medium">No assignment data cached</p>
          <p className="text-xs text-muted-foreground">
            Connect to the internet to sync your assignment.
          </p>
        </div>
      ) : (
        <div className="flex-1 relative">
          {viewMode === 'map' ? (
            <DeliverMap
              items={items}
              selectedId={selectedId}
              onSelect={(id) => { setPanTo(null); handleSelect(id) }}
              panTo={panTo}
            />
          ) : (
            <DeliverCardList
              items={items}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id)
                setViewMode('map')
              }}
              photoPreviews={photoPreviews}
              onRefresh={refetch}
              isRefreshing={isRefetching}
            />
          )}

          {/* Progress pill (map mode) */}
          {viewMode === 'map' && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000]">
              <div className="bg-background/90 backdrop-blur-sm rounded-full px-4 py-1.5 shadow-lg border text-xs font-semibold whitespace-nowrap flex items-center gap-2">
                Delivered {deliveredCount}/{items.length}
                {useCache && (
                  <span className="text-[9px] text-amber-600 font-normal">(cached)</span>
                )}
              </div>
            </div>
          )}

          {/* Bottom sheet */}
          <DeliverBottomSheet
            item={selectedItem}
            deliveredCount={deliveredCount}
            totalItems={items.length}
            onPhotoCapture={handlePhotoCapture}
            photoPreview={selectedPreview ?? null}
            isUploading={isUploading}
            onMarkDelivered={handleMarkDelivered}
            onMarkMissed={handleMarkMissed}
            isMarking={markItem.isPending}
          />
        </div>
      )}
    </div>
  )
}
