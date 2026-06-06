'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { NotificationsBell } from '@/components/notifications/notifications-bell'
import { Building2, Menu, RefreshCw, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AppHeaderProps {
  title?: string
  actions?: React.ReactNode
}

export function AppHeader({ title, actions }: AppHeaderProps) {
  const user = useAuthStore((s) => s.user)
  const displayName = useAuthStore((s) => s.displayName)
  const toggleSidebar = useBillingUIStore((s) => s.toggleSidebar)
  const pageTitle = useBillingUIStore((s) => s.pageTitle)
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

  const displayTitle = title || pageTitle || 'TMT'

  return (
    <header className="border-b bg-card shrink-0">
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

            <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-black text-primary">
                {(displayName || user?.email)?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
