'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingStore } from '@/stores/billing-store'
import { useStaffAssignment } from '@/hooks/use-assignments'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { useToast } from '@/hooks/use-toast'
import { cacheAssignment, getCachedAssignment } from '@/lib/offline-cache'
import type { CachedAssignment } from '@/lib/offline-cache'
import { Loader2, WifiOff, CheckCircle2, ArrowLeft, ArrowRight, ChevronDown, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssignmentItemWithUnit } from '@/types'
import { shortenMCName, compareMC } from '@/lib/mc-utils'
import { AppShell } from '@/components/layout/AppShell'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { usePhotoQueue } from '@/hooks/use-photo-queue'

const PAGE_SIZE = 50

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  pending: { label: 'Pending', dot: 'bg-blue-500' },
  processing: { label: 'Processing', dot: 'bg-amber-500' },
  delivered: { label: 'Delivered', dot: 'bg-green-500' },
  missed: { label: 'Missed', dot: 'bg-red-500' },
  skipped: { label: 'Skipped', dot: 'bg-gray-400' },
}

function formatTime(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function DeliverPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const roleName = useAuthStore((s) => s.roleName)
  const setPageIdentity = useBillingUIStore((s) => s.setPageIdentity)
  const setView = useBillingStore((s) => s.setView)
  const setDeliverTarget = useBillingStore((s) => s.setDeliverTarget)
  const staffMode = useBillingStore((s) => s.staffMode)
  const { toast } = useToast()
  const [useCache, setUseCache] = useState(false)
  const [page, setPage] = useState(0)
  const [filterTab, setFilterTab] = useState<'pending' | 'issues' | 'delivered' | 'all'>('pending')
  const [selectedUc, setSelectedUc] = useState<string>('all')
  const [ucDropdownOpen, setUcDropdownOpen] = useState(false)
  const [dbUnsyncedCount, setDbUnsyncedCount] = useState(0)

  const { queueCount, isProcessing, processQueue, processingIndex, totalToProcess, currentFileSize, uploadSpeed } = usePhotoQueue()

  const { data, isLoading, isError, refetch } = useStaffAssignment(user?.id || null)
  const isOnline = useOnlineStatus()

  useEffect(() => { setPageIdentity('Deliver') }, [setPageIdentity])

  // Fallback: check DB for unsynced photos when IndexedDB queue is empty
  useEffect(() => {
    if (!user?.id) return
    fetch('/api/deliveries/unsynced')
      .then(r => r.json())
      .then(json => {
        if (json.count) setDbUnsyncedCount(json.count)
      })
      .catch(() => {})
  }, [user?.id])

  const [cached, setCached] = useState<CachedAssignment | null>(null)

  useEffect(() => {
    if (data?.items) {
      cacheAssignment(data.data as unknown as Record<string, unknown> | null, data.items as unknown as Record<string, unknown>[])
      setUseCache(false)
    }
  }, [data])

  useEffect(() => {
    if (!isLoading && (!data || isError)) {
      getCachedAssignment().then((c) => { if (c) setUseCache(true) })
    }
  }, [isLoading, data, isError])

  useEffect(() => {
    if (useCache) {
      getCachedAssignment().then(setCached)
    } else {
      setCached(null)
    }
  }, [useCache])

  useEffect(() => {
    if (roleName !== 'field_staff') router.replace('/map')
  }, [roleName, router])

  const displayData = cached ? { data: cached.data, items: cached.items } : data
  const items: AssignmentItemWithUnit[] = (displayData?.items as unknown as AssignmentItemWithUnit[]) || []
  const assignment = displayData?.data as unknown as Record<string, unknown> | null
  const totalCount = items.length
  const deliveredCount = useMemo(() => items.filter((i) => i.status === 'delivered').length, [items])
  const progressPct = totalCount > 0 ? Math.round((deliveredCount / totalCount) * 100) : 0
  const setDeliveryStartTime = useBillingStore((s) => s.setDeliveryStartTime)

  useEffect(() => {
    let earliest: number | null = null
    for (const item of items) {
      const ts = item.started_at || item.delivered_at
      if (!ts) continue
      const t = new Date(ts).getTime()
      if (earliest === null || t < earliest) earliest = t
    }
    setDeliveryStartTime(earliest)
  }, [items, setDeliveryStartTime])

  const pendingCount = useMemo(() => items.filter((i) => i.status === 'pending').length, [items])
  const issuesCount = useMemo(() => items.filter((i) => i.status === 'processing' || i.status === 'missed').length, [items])
  const deliveredCountPill = useMemo(() => items.filter((i) => i.status === 'delivered').length, [items])

  const ucGroups = useMemo(() => {
    const groups: Record<string, { items: AssignmentItemWithUnit[]; pending: number; delivered: number; total: number }> = {}
    for (const item of items) {
      const uc = item.unit?.uc_name || 'Unknown'
      if (!groups[uc]) groups[uc] = { items: [], pending: 0, delivered: 0, total: 0 }
      groups[uc].items.push(item)
      groups[uc].total++
      if (item.status === 'pending' || item.status === 'processing') groups[uc].pending++
      if (item.status === 'delivered') groups[uc].delivered++
    }
    return Object.entries(groups).sort(([a], [b]) => compareMC(a, b))
  }, [items])

  const ucOptions = useMemo(() => {
    const options: { uc: string; label: string; total: number }[] = []
    for (const [uc] of ucGroups) {
      options.push({ uc, label: shortenMCName(uc), total: ucGroups.find(([k]) => k === uc)![1].total })
    }
    return options
  }, [ucGroups])

  const filtered = useMemo(() => {
    let list = items
    if (selectedUc !== 'all') list = list.filter((i) => (i.unit?.uc_name || 'Unknown') === selectedUc)
    if (filterTab === 'pending') return list.filter((i) => i.status === 'pending')
    if (filterTab === 'issues') return list.filter((i) => i.status === 'processing' || i.status === 'missed')
    if (filterTab === 'delivered') return list.filter((i) => i.status === 'delivered')
    return list
  }, [items, filterTab, selectedUc])

  const sorted = [...filtered].sort((a, b) => (a.route_seq || 0) - (b.route_seq || 0))
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const handleSelect = (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item?.unit) return
    if (staffMode === 'browse') {
      toast('Switch to delivery mode to deliver this bill', 'warning')
      return
    }
    setDeliverTarget(item.psid)
    setView('map')
    router.push(`/map?target=${encodeURIComponent(item.psid)}`)
  }

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        {/* Loading */}
        {isLoading && !useCache ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-pulse text-sm text-muted-foreground">Loading assignment...</div>
          </div>
        ) : isError && !useCache ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
            <div className="text-4xl">⚠️</div>
            <p className="text-sm font-medium">Server error — tap to retry</p>
            <p className="text-xs text-muted-foreground">
              Could not load your assignment. Check your connection and try again.
            </p>
            <button
              onClick={() => refetch()}
              className="mt-2 px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            >
              Retry
            </button>
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
          <div className="flex-1 flex flex-col min-h-0">
            {/* Offline banner */}
            {(!isOnline || useCache) && (
              <div className="px-4 py-1.5 border-b bg-muted/30 flex items-center gap-2 shrink-0">
                {!isOnline && (
                  <span className="text-[10px] text-amber-600 flex items-center gap-1 font-medium">
                    <WifiOff className="h-3 w-3" /> Offline
                  </span>
                )}
                {useCache && isOnline && (
                  <span className="text-[10px] text-red-600 font-medium">Server error — showing cached data</span>
                )}
                {useCache && !isOnline && (
                  <span className="text-[10px] text-amber-600 font-medium">Offline (cached)</span>
                )}
              </div>
            )}

            {/* Progress header */}
            <div className="px-4 py-2.5 border-b shrink-0">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span className="font-medium">{deliveredCount} of {totalCount} delivered</span>
                <span>{progressPct}%</span>
              </div>
              <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Queue badge */}
            {queueCount > 0 && (
              <div className="px-4 py-1.5 border-b shrink-0 flex items-center justify-between bg-amber-50 dark:bg-amber-950/10">
                <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                  {isProcessing
                    ? `Syncing ${processingIndex + 1}/${totalToProcess}${currentFileSize ? ` (${currentFileSize})` : ''}`
                    : `${queueCount} photo${queueCount !== 1 ? 's' : ''} waiting to sync`
                  }
                </span>
                <button
                  onClick={() => processQueue()}
                  disabled={isProcessing}
                  className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-800 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {uploadSpeed ? ` ${uploadSpeed}` : ''}
                    </>
                  ) : (
                    <Upload className="h-3 w-3" />
                  )}
                  {!isProcessing && 'Sync'}
                </button>
              </div>
            )}

            {/* DB unsynced fallback — when IndexedDB queue is empty but DB has photos */}
            {!isProcessing && dbUnsyncedCount > 0 && queueCount === 0 && (
              <div className="px-4 py-1.5 border-b shrink-0 bg-red-50 dark:bg-red-950/10">
                <p className="text-[10px] font-medium text-red-600 dark:text-red-400">
                  {dbUnsyncedCount} photo{dbUnsyncedCount !== 1 ? 's' : ''} stuck in database — queue was cleared
                </p>
                <p className="text-[9px] text-red-500/70 mt-0.5">
                  These photos were lost from the local queue. Go to Settings → Failed Uploads or visit admin.
                </p>
              </div>
            )}

            {/* UC Dropdown */}
            <div className="relative px-4 py-2 border-b shrink-0">
              <button
                onClick={() => setUcDropdownOpen(!ucDropdownOpen)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm font-medium"
              >
                <span>
                  {selectedUc === 'all'
                    ? `All UCs (${totalCount})`
                    : `${shortenMCName(selectedUc)} (${ucGroups.find(([k]) => k === selectedUc)?.[1].total || 0})`}
                </span>
                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', ucDropdownOpen && 'rotate-180')} />
              </button>
              {ucDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUcDropdownOpen(false)} />
                  <div className="absolute left-4 right-4 top-full mt-1 z-20 bg-popover border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    <button
                      onClick={() => { setSelectedUc('all'); setPage(0); setUcDropdownOpen(false) }}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-accent transition-colors cursor-pointer',
                        selectedUc === 'all' && 'bg-accent font-semibold'
                      )}
                    >
                      <span>All UCs</span>
                      <span className="text-muted-foreground">{totalCount}</span>
                    </button>
                    {ucOptions.map((opt) => (
                      <button
                        key={opt.uc}
                        onClick={() => { setSelectedUc(opt.uc); setPage(0); setUcDropdownOpen(false) }}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-accent transition-colors cursor-pointer',
                          selectedUc === opt.uc && 'bg-accent font-semibold'
                        )}
                      >
                        <span className="truncate">{opt.label}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">{opt.total}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Filter pills */}
            <div className="flex gap-1.5 px-4 py-2 border-b shrink-0 overflow-x-auto scrollbar-none">
              <button
                onClick={() => { setFilterTab('pending'); setPage(0) }}
                className={cn(
                  'shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer',
                  filterTab === 'pending'
                    ? 'bg-blue-500/10 text-blue-600 border border-blue-200'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                )}
              >
                Pending ({pendingCount})
              </button>
              <button
                onClick={() => { setFilterTab('issues'); setPage(0) }}
                className={cn(
                  'shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer',
                  filterTab === 'issues'
                    ? 'bg-amber-500/10 text-amber-600 border border-amber-200'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                )}
              >
                Issues ({issuesCount})
              </button>
              <button
                onClick={() => { setFilterTab('delivered'); setPage(0) }}
                className={cn(
                  'shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer',
                  filterTab === 'delivered'
                    ? 'bg-green-500/10 text-green-600 border border-green-200'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                )}
              >
                Delivered ({deliveredCountPill})
              </button>
              <button
                onClick={() => { setFilterTab('all'); setPage(0) }}
                className={cn(
                  'shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer',
                  filterTab === 'all'
                    ? 'bg-muted text-foreground border border-border'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                )}
              >
                All ({items.length})
              </button>
            </div>

            {/* List — flat paginated */}
            <div className="flex-1 overflow-y-auto">
              {pageItems.map((item) => {
                const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending
                const sid = item.survey_id
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 border-b border-border/50 hover:bg-accent/30 active:bg-accent/50 transition-colors text-left cursor-pointer"
                  >
                    {/* Route seq */}
                    <span className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                      {item.route_seq || '-'}
                    </span>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">
                          {item.unit?.consumer_name || 'Unknown'}
                        </span>
                        <span className={cn('shrink-0 w-1.5 h-1.5 rounded-full', cfg.dot)} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {item.unit?.address && (
                          <span className="truncate">{item.unit.address}</span>
                        )}
                        {item.status === 'delivered' && item.delivered_at && (
                          <span className="shrink-0 text-[10px] text-green-600 font-medium">
                            {formatTime(item.delivered_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Survey ID + status */}
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-mono font-extrabold text-foreground">
                        {(sid?.length ?? 0) > 10 ? sid!.slice(-10) : (sid ?? '')}
                      </p>
                      <p className={cn(
                        'text-[10px] font-semibold mt-0.5',
                        item.status === 'delivered' && 'text-green-600',
                        item.status === 'missed' && 'text-red-600',
                        item.status === 'pending' && 'text-blue-600',
                        item.status === 'processing' && 'text-amber-600',
                        item.status === 'skipped' && 'text-gray-500',
                      )}>
                        {cfg.label}
                      </p>
                    </div>
                  </button>
                )
              })}

              {filtered.length === 0 && (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  {filterTab === 'issues' ? 'No issues — all clear!' : 'No items in this view'}
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t bg-card shrink-0">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none py-1 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Previous
                </button>
                <span className="text-[10px] text-muted-foreground">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none py-1 cursor-pointer"
                >
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
