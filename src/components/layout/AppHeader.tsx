'use client'

import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingStore } from '@/stores/billing-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { MobileFilterSheet } from '@/components/filter-panel'
import { Building2, Check, Layers, Menu, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AppHeaderProps {
  title?: string
  actions?: React.ReactNode
  forceBack?: boolean
  onBack?: () => void
}

export function AppHeader({ title, actions, forceBack, onBack }: AppHeaderProps) {
  const user = useAuthStore((s) => s.user)
  const activeView = useBillingStore((s) => s.activeView)
  const goBackStore = useBillingStore((s) => s.goBack)
  const navHistory = useBillingStore((s) => s.navHistory)
  const mapType = useBillingStore((s) => s.mapType)
  const setMapType = useBillingStore((s) => s.setMapType)
  const toggleSidebar = useBillingUIStore((s) => s.toggleSidebar)
  const pageTitle = useBillingUIStore((s) => s.pageTitle)
  const filters = useBillingStore((s) => s.filters)
  const pendingFilters = useBillingStore((s) => s.pendingFilters)
  const applyFilters = useBillingStore((s) => s.applyFilters)
  const cancelFilters = useBillingStore((s) => s.cancelFilters)
  const queryClient = useQueryClient()

  const hasUnapplied = useMemo(
    () => JSON.stringify(filters) !== JSON.stringify(pendingFilters),
    [filters, pendingFilters]
  )

  const handleUpdate = useCallback(() => {
    queryClient.invalidateQueries()
  }, [queryClient])

  const showBack = forceBack || (navHistory.length > 0 && activeView !== 'detail')
  const displayTitle = title || pageTitle || 'TMT'

  return (
    <header className="flex items-center justify-between px-2 py-1.5 border-b bg-card shrink-0 min-h-[44px]">
      <div className="flex items-center gap-1 min-w-0 flex-1">
        {showBack ? (
          <button
            onClick={onBack || goBackStore}
            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer shrink-0"
            aria-label="Back"
          >
            <span className="text-xl leading-none">‹</span>
          </button>
        ) : (
          <button
            onClick={toggleSidebar}
            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer shrink-0"
            aria-label="Menu"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
        <div className="flex items-center gap-1.5 min-w-0">
          <Building2 className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-bold tracking-tight truncate">{displayTitle}</span>
        </div>
      </div>

      {actions ?? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleUpdate}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer"
            title="Refresh data"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          {hasUnapplied && (
            <>
              <button
                onClick={cancelFilters}
                className="h-8 text-[11px] font-bold px-2 rounded-lg border border-border hover:bg-muted cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={applyFilters}
                className={cn(
                  'h-8 text-[11px] font-bold px-2.5 rounded-lg flex items-center gap-1 cursor-pointer',
                  'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                <Check className="h-3 w-3" />
                Apply
              </button>
            </>
          )}

          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/50 max-w-[140px]">
            <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-[9px] font-black text-primary">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <span className="text-[10px] font-medium text-muted-foreground truncate">
              {user?.email?.split('@')[0] || ''}
            </span>
          </div>
          <MobileFilterSheet />
          <button
            onClick={() => setMapType(mapType === 'streets' ? 'satellite' : 'streets')}
            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer"
            title={mapType === 'streets' ? 'Satellite' : 'Street'}
          >
            <Layers className="h-4 w-4" />
          </button>
        </div>
      )}
    </header>
  )
}
