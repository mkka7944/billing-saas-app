'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingStore } from '@/stores/billing-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { NotificationsBell } from '@/components/notifications/notifications-bell'
import { Building2, Menu, RefreshCw, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { refreshCurrentPage } from '@/lib/queries/refresh'

interface AppHeaderProps {
  title?: string
  actions?: React.ReactNode
}

export function AppHeader({ title, actions }: AppHeaderProps) {
  const user = useAuthStore((s) => s.user)
  const displayName = useAuthStore((s) => s.displayName)
  const toggleSidebar = useBillingUIStore((s) => s.toggleSidebar)
  const pageTitle = useBillingUIStore((s) => s.pageTitle)
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const queryDuration = useBillingStore((s) => s.queryDuration)
  const isFetching = useIsFetching() > 0
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const successTimer = useRef<number>(0)
  const refreshTriggeredRef = useRef(false)
  const wasFetchingRef = useRef(false)

  const isRefreshing = manualRefreshing

  // Reset manualRefreshing after a real fetch cycle completes
  useEffect(() => {
    if (manualRefreshing && refreshTriggeredRef.current) {
      if (isFetching) {
        wasFetchingRef.current = true
      } else if (wasFetchingRef.current) {
        setManualRefreshing(false)
        wasFetchingRef.current = false
        refreshTriggeredRef.current = false
      }
    }
  }, [isFetching, manualRefreshing])

  // Show "✓ duration" after manual refresh completes
  useEffect(() => {
    if (!manualRefreshing && queryDuration != null && !isFetching && showSuccess === false) {
      setShowSuccess(true)
      window.clearTimeout(successTimer.current)
      successTimer.current = window.setTimeout(() => setShowSuccess(false), 2000)
    }
    return () => { window.clearTimeout(successTimer.current) }
  }, [manualRefreshing, isFetching, queryDuration])

  const handleRefresh = useCallback(() => {
    refreshTriggeredRef.current = true
    setManualRefreshing(true)
    refreshCurrentPage(pathname, queryClient)
  }, [pathname, queryClient])

  const displayTitle = title || pageTitle || 'TMT'

  return (
    <header className="border-b bg-card shrink-0">
      <div className="flex items-center justify-between px-2 py-1.5 min-h-[48px]">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <button
            onClick={toggleSidebar}
            className="h-11 w-11 lg:hidden flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer shrink-0"
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
            <div className="relative w-10 h-4 shrink-0 flex items-center justify-center">
              {isRefreshing && (
                <span className="absolute text-[10px] text-muted-foreground font-medium tabular-nums">...</span>
              )}
              {showSuccess && !isRefreshing && (
                <span className="absolute text-[10px] text-green-600 dark:text-green-300 font-medium tabular-nums">✓ {(queryDuration! / 1000).toFixed(1)}s</span>
              )}
            </div>
            <div className="relative">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-9 w-9 flex items-center justify-center rounded-lg border border-border hover:bg-muted cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
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
            <div className="h-9 flex items-center gap-1.5 px-2 rounded-lg border border-border hover:bg-muted shrink-0 cursor-pointer">
              <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-black text-primary">
                  {(displayName || user?.email)?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <span className="text-[10px] font-medium truncate max-w-[80px]">
                {displayName || user?.email?.split('@')[0] || 'User'}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
