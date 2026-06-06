'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingStore } from '@/stores/billing-store'
import { useStaffAssignment } from '@/hooks/use-assignments'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { cacheAssignment, getCachedAssignment } from '@/lib/offline-cache'
import { Loader2, WifiOff, CheckCircle2, CreditCard, ArrowLeft, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssignmentItemWithUnit } from '@/types'
import { AppShell } from '@/components/layout/AppShell'
import { useBillingUIStore } from '@/stores/billing-ui-store'

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
  const [useCache, setUseCache] = useState(false)
  const [page, setPage] = useState(0)
  const [filterTab, setFilterTab] = useState<'pending' | 'issues' | 'delivered' | 'all'>('pending')

  const { data, isLoading, refetch } = useStaffAssignment(user?.id || null)
  const isOnline = useOnlineStatus()

  useEffect(() => { setPageIdentity('Deliver') }, [setPageIdentity])

  useEffect(() => {
    if (data?.items) {
      cacheAssignment(data.data as unknown as Record<string, unknown> | null, data.items as unknown as Record<string, unknown>[])
      setUseCache(false)
    }
  }, [data])

  useEffect(() => {
    if (!isLoading && !data && !isOnline) {
      const cached = getCachedAssignment()
      if (cached) setUseCache(true)
    }
  }, [isLoading, data, isOnline])

  useEffect(() => {
    if (roleName !== 'field_staff') router.replace('/map')
  }, [roleName, router])

  const cached = useCache ? getCachedAssignment() : null
  const displayData = cached ? { data: cached.data, items: cached.items } : data
  const items: AssignmentItemWithUnit[] = (displayData?.items as unknown as AssignmentItemWithUnit[]) || []
  const assignment = displayData?.data as unknown as Record<string, unknown> | null
  const totalCount = items.length
  const deliveredCount = useMemo(() => items.filter((i) => i.status === 'delivered').length, [items])
  const progressPct = totalCount > 0 ? Math.round((deliveredCount / totalCount) * 100) : 0

  const pendingCount = useMemo(() => items.filter((i) => i.status === 'pending').length, [items])
  const issuesCount = useMemo(() => items.filter((i) => i.status === 'processing' || i.status === 'missed').length, [items])
  const deliveredCountPill = useMemo(() => items.filter((i) => i.status === 'delivered').length, [items])

  const filtered = useMemo(() => {
    if (filterTab === 'pending') return items.filter((i) => i.status === 'pending')
    if (filterTab === 'issues') return items.filter((i) => i.status === 'processing' || i.status === 'missed')
    if (filterTab === 'delivered') return items.filter((i) => i.status === 'delivered')
    return items
  }, [items, filterTab])

  const sorted = [...filtered].sort((a, b) => (a.route_seq || 0) - (b.route_seq || 0))
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const handleSelect = (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item?.unit) return
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
                {useCache && (
                  <span className="text-[10px] text-amber-600 font-medium">(cached)</span>
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

            {/* Filter pills */}
            <div className="flex gap-1.5 px-4 py-2 border-b shrink-0">
              <button
                onClick={() => { setFilterTab('pending'); setPage(0) }}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer',
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
                  'px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer',
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
                  'px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer',
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
                  'px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer',
                  filterTab === 'all'
                    ? 'bg-muted text-foreground border border-border'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                )}
              >
                All ({items.length})
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {pageItems.map((item) => {
                const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-border/50 hover:bg-accent/30 active:bg-accent/50 transition-colors text-left cursor-pointer"
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

                    {/* Amount + status */}
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold">
                        Rs.{((item.unit?.monthly_fee ?? 0) + (item.unit?.arrears ?? 0)).toLocaleString()}
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

              {sorted.length === 0 && (
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
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
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
