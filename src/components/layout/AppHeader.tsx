'use client'

import { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingStore } from '@/stores/billing-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { MobileFilterSheet } from '@/components/filter-panel'
import { NotificationsBell } from '@/components/notifications/notifications-bell'
import { Building2, Layers, LogOut, Menu, RefreshCw, Search, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AppHeaderProps {
  title?: string
  actions?: React.ReactNode
}

export function AppHeader({ title, actions }: AppHeaderProps) {
  const user = useAuthStore((s) => s.user)
  const displayName = useAuthStore((s) => s.displayName)
  const roleName = useAuthStore((s) => s.roleName)
  const signOut = useAuthStore((s) => s.signOut)
  const mapType = useBillingStore((s) => s.mapType)
  const setMapType = useBillingStore((s) => s.setMapType)
  const toggleSidebar = useBillingUIStore((s) => s.toggleSidebar)
  const pageTitle = useBillingUIStore((s) => s.pageTitle)
  const filters = useBillingStore((s) => s.filters)
  const pendingFilters = useBillingStore((s) => s.pendingFilters)
  const setFilters = useBillingStore((s) => s.setPendingFilter)
  const applyFilters = useBillingStore((s) => s.applyFilters)
  const cancelFilters = useBillingStore((s) => s.cancelFilters)
  const queryClient = useQueryClient()
  const isFetching = useIsFetching()
  const isRefreshing = isFetching > 0
  const [showSuccess, setShowSuccess] = useState(false)
  const successTimer = useRef<number>(0)

  const handleUpdate = useCallback(() => {
    queryClient.invalidateQueries()
  }, [queryClient])

  useEffect(() => {
    if (isFetching === 0 && showSuccess) {
      window.clearTimeout(successTimer.current)
      successTimer.current = window.setTimeout(() => setShowSuccess(false), 2000)
    }
    return () => window.clearTimeout(successTimer.current)
  }, [isFetching, showSuccess])

  useEffect(() => {
    if (isFetching > 0) setShowSuccess(false)
  }, [isFetching])

  const handleRefresh = useCallback(() => {
    setShowSuccess(true)
    handleUpdate()
  }, [handleUpdate])

  const hasUnapplied = useMemo(
    () => JSON.stringify(filters) !== JSON.stringify(pendingFilters),
    [filters, pendingFilters]
  )

  const displayTitle = title || pageTitle || 'TMT'

  return (
    <header className="border-b bg-card shrink-0">
      {/* Row 1: Menu + Title + Actions */}
      <div className="flex items-center justify-between px-2 py-1.5 min-h-[48px]">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <button
            onClick={toggleSidebar}
            className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer shrink-0"
            aria-label="Menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5 min-w-0">
            <Building2 className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs font-bold tracking-tight truncate">{displayTitle}</span>
          </div>
        </div>

        {actions ?? (
          <div className="flex items-center gap-1 shrink-0">
            <div className="relative">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                title={isRefreshing ? 'Updating...' : showSuccess ? 'Updated' : 'Refresh data'}
              >
                <RefreshCw
                  className={cn(
                    'h-3.5 w-3.5 transition-none',
                    isRefreshing && 'animate-spin'
                  )}
                />
              </button>
              {showSuccess && !isRefreshing && (
                <span className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full bg-green-500 flex items-center justify-center">
                  <Check className="h-2.5 w-2.5 text-white" />
                </span>
              )}
            </div>
            <NotificationsBell />
            {isRefreshing && (
              <span className="text-[10px] text-muted-foreground font-medium animate-pulse whitespace-nowrap">Syncing...</span>
            )}
            {showSuccess && !isRefreshing && (
              <span className="text-[10px] text-green-600 dark:text-green-300 font-medium whitespace-nowrap">Updated</span>
            )}

            {hasUnapplied && (
              <>
                <button
                  onClick={cancelFilters}
                  className="h-11 text-xs font-bold px-3 rounded-lg border border-border hover:bg-muted cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={applyFilters}
                  className={cn(
                    'h-11 text-xs font-bold px-3 rounded-lg flex items-center gap-1 cursor-pointer',
                    'bg-primary text-primary-foreground hover:bg-primary/90'
                  )}
                >
                  Apply
                </button>
              </>
            )}

            <div className="flex items-center gap-1">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/50">
                <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-black text-primary">
                    {(displayName || user?.email)?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-medium text-foreground truncate max-w-[80px] leading-tight">
                    {displayName || user?.email?.split('@')[0] || ''}
                  </div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase leading-tight">
                    {roleName === 'super_admin' ? 'Super Admin' : roleName === 'admin' ? 'Admin' : 'Staff'}
                  </div>
                </div>
              </div>
              <button
                onClick={async () => { await signOut(); window.location.href = '/login' }}
                className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer text-muted-foreground hover:text-rose-500 dark:hover:text-rose-300 transition-colors"
                title="Sign Out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Row 2: Search + Filter — mobile only */}
      <div className="lg:hidden px-2 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              placeholder="Search name or ID..."
              value={filters.search}
              onChange={(e) => setFilters({ search: e.target.value })}
              className="w-full h-9 pl-8 pr-8 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-ring transition-shadow"
            />
            {filters.search && (
              <button
                onClick={() => setFilters({ search: '' })}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded hover:bg-muted cursor-pointer"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
          <MobileFilterSheet />
          <button
            onClick={() => setMapType(mapType === 'streets' ? 'satellite' : 'streets')}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-border hover:bg-muted cursor-pointer shrink-0"
            title={mapType === 'streets' ? 'Satellite' : 'Street'}
          >
            <Layers className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  )
}
