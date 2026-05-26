'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useStaffAssignment, useMarkItem } from '@/hooks/use-assignments'
import { usePhotoQueue } from '@/hooks/use-photo-queue'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { cacheAssignment, getCachedAssignment } from '@/lib/offline-cache'
import dynamic from 'next/dynamic'
import { Map, List, BarChart3, Upload, Loader2, WifiOff, CheckCircle2, XCircle, Clock, ArrowRight } from 'lucide-react'
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

type ViewMode = 'map' | 'list' | 'stats'

function TodayStats({ items }: { items: AssignmentItemWithUnit[] }) {
  const delivered = items.filter((i) => i.status === 'delivered').length
  const missed = items.filter((i) => i.status === 'missed').length
  const pending = items.filter((i) => i.status === 'pending').length
  const total = items.length
  const rate = total > 0 ? Math.round((delivered / total) * 100) : 0

  const stats = [
    { label: 'Delivered', value: delivered, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100' },
    { label: 'Missed', value: missed, icon: XCircle, color: 'text-red-600', bg: 'bg-red-100' },
    { label: 'Pending', value: pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100' },
  ]

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border p-4 text-center space-y-2">
            <div className={cn('p-2 rounded-lg inline-flex mx-auto', s.bg)}>
              <s.icon className={cn('h-5 w-5', s.color)} />
            </div>
            <p className="text-2xl font-bold tabular-nums">{s.value}</p>
            <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Delivery Rate</span>
          <span className="text-lg font-bold text-primary">{rate}%</span>
        </div>
        <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${rate}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{delivered} completed</span>
          <span>{total} total</span>
        </div>
      </div>
    </div>
  )
}

export default function DeliverPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const role = useAuthStore((s) => s.role)
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
    if (!user) { router.replace('/login'); return }
    if (role === 'admin') router.replace('/map')
  }, [user, role, router])

  // Use cached data as fallback
  const cached = useCache ? getCachedAssignment() : null
  const displayData = cached
    ? { data: cached.data, items: cached.items }
    : data

  const items: AssignmentItemWithUnit[] = (displayData?.items as unknown as AssignmentItemWithUnit[]) || []
  const assignment = displayData?.data as unknown as Record<string, unknown> | null
  const deliveredCount = useMemo(() => items.filter((i) => i.status === 'delivered').length, [items])
  const totalCount = items.length

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

  const tabs = [
    { id: 'map' as const, label: 'Map', icon: Map },
    { id: 'list' as const, label: 'List', icon: List },
    { id: 'stats' as const, label: 'Stats', icon: BarChart3 },
  ]

  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden staff-light-mode">
      {/* Error banner */}
      {lastError && (
        <div className="h-8 shrink-0 flex items-center justify-center bg-destructive/10 text-destructive text-xs font-medium px-4">
          {lastError}
        </div>
      )}

      <AppHeader
        title={viewMode === 'list' ? 'All Items' : viewMode === 'stats' ? 'Today\'s Stats' : 'Deliver'}
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

      {/* Persistent progress bar */}
      {items.length > 0 && viewMode !== 'stats' && (
        <div className="shrink-0 px-4 py-2 border-b bg-muted/30 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-foreground">
                {deliveredCount}/{totalCount} delivered
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {totalCount > 0 ? Math.round((deliveredCount / totalCount) * 100) : 0}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${totalCount > 0 ? (deliveredCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>
          {useCache && (
            <span className="text-[9px] text-amber-600 font-medium shrink-0">(cached)</span>
          )}
        </div>
      )}

      {/* Content area */}
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
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <p className="text-sm font-semibold text-green-600">All caught up!</p>
          <p className="text-xs text-muted-foreground">
            Every bill has been delivered or marked.
          </p>
        </div>
      ) : (
        <div className="flex-1 relative">
          {viewMode === 'map' && (
            <DeliverMap
              items={items}
              selectedId={selectedId}
              onSelect={(id) => { setPanTo(null); handleSelect(id) }}
              panTo={panTo}
            />
          )}
          {viewMode === 'list' && (
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
          {viewMode === 'stats' && <TodayStats items={items} />}

          {/* Bottom sheet — only on map/list views when an item is selected */}
          {viewMode !== 'stats' && (
            <DeliverBottomSheet
              item={selectedItem}
              deliveredCount={deliveredCount}
              totalItems={totalCount}
              onPhotoCapture={handlePhotoCapture}
              photoPreview={selectedPreview ?? null}
              isUploading={isUploading}
              onMarkDelivered={handleMarkDelivered}
              onMarkMissed={handleMarkMissed}
              isMarking={markItem.isPending}
            />
          )}
        </div>
      )}

      {/* Bottom tab nav */}
      {items.length > 0 && (
        <nav className="flex items-center justify-around border-t bg-card shrink-0 safe-area-bottom">
          {tabs.map((tab) => {
            const isActive = viewMode === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id)}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2.5 px-4 min-w-0 transition-colors cursor-pointer min-h-[44px]",
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
  )
}
