'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Loader2, CheckCircle2, AlertTriangle, Info, MessageSquare, ExternalLink } from 'lucide-react'
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/use-notifications'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import type { Notification } from '@/types'

interface NotificationsBellProps {
  className?: string
}

export function NotificationsBell({ className }: NotificationsBellProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const desktopPanelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (
        desktopPanelRef.current &&
        !desktopPanelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={cn('relative h-9 w-9 flex items-center justify-center rounded-lg border border-border hover:bg-muted cursor-pointer shrink-0', className)}
        title="Notifications"
      >
        <Bell className="h-3.5 w-3.5" />
        <UnreadBadge />
      </button>

      {/* Mobile: backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Mobile: bottom sheet */}
      {open && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl shadow-2xl flex flex-col max-h-[85vh] lg:hidden animate-in slide-in-from-bottom-2 duration-300 ease-out">
          <div className="flex justify-center pt-2.5 pb-2 shrink-0">
            <div className="w-9 h-1 rounded-full bg-muted-foreground/20" />
          </div>
          <div className="flex items-center justify-between px-4 pb-2 shrink-0">
            <h2 className="text-sm font-bold">Notifications</h2>
            <button onClick={() => setOpen(false)} className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer">Close</button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            <NotificationsPanelContent onClose={() => setOpen(false)} router={router} />
          </div>
        </div>
      )}

      {/* Desktop: dropdown panel */}
      {open && (
        <div className="fixed inset-0 z-50 hidden lg:block" onClick={() => setOpen(false)}>
          <div
            ref={desktopPanelRef}
            className="fixed top-[48px] right-2 w-[380px] bg-background rounded-xl shadow-2xl border border-border flex flex-col max-h-[600px] z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
              <h2 className="text-sm font-bold">Notifications</h2>
              <button onClick={() => setOpen(false)} className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer">Close</button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              <NotificationsPanelContent onClose={() => setOpen(false)} router={router} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UnreadBadge() {
  const { data } = useNotifications()
  const count = data?.unread_count ?? 0
  if (count === 0) return null
  return (
    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground flex items-center justify-center leading-none">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function NotificationsPanelContent({
  onClose,
  router: externalRouter,
}: {
  onClose: () => void
  router?: ReturnType<typeof useRouter>
}) {
  const { data, isLoading } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const internalRouter = useRouter()
  const r = externalRouter || internalRouter
  const { toast } = useToast()

  const handleClick = useCallback(async (n: Notification) => {
    if (!n.read) {
      markRead.mutate(n.id)
    }
    if (n.link) {
      r.push(n.link)
    }
    onClose()
  }, [markRead, r, onClose])

  const handleMarkAllRead = useCallback(() => {
    markAllRead.mutate(undefined, {
      onSuccess: () => toast('All marked as read', 'success'),
      onError: () => toast('Failed to mark all read', 'error'),
    })
  }, [markAllRead, toast])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading...
      </div>
    )
  }

  const notifications = data?.notifications || []
  const unreadCount = data?.unread_count ?? 0
  const summary = data?.summary

  return (
    <div className="space-y-2">
      {/* Admin summary */}
      {summary && (summary.pending > 0 || summary.processing > 0) && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors"
          onClick={() => { r.push('/settings?tab=delivery'); onClose() }}
        >
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">{summary.processing + summary.pending} items need attention</p>
            <p className="text-[10px] text-amber-600 dark:text-amber-400">{summary.processing} processing · {summary.pending} pending</p>
          </div>
          <ExternalLink className="h-3 w-3 text-amber-400 shrink-0" />
        </div>
      )}

      {/* Notification list */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <Bell className="h-8 w-8" />
          <p className="text-sm font-medium">No notifications</p>
          <p className="text-xs">You&apos;re all caught up.</p>
        </div>
      ) : (
        <>
          {unreadCount > 0 && (
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={handleMarkAllRead} disabled={markAllRead.isPending} className="h-7 text-[10px]">
                {markAllRead.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Mark all read
              </Button>
            </div>
          )}
          <div className="space-y-1">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  'flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors',
                  !n.read ? 'bg-muted/50 hover:bg-muted' : 'hover:bg-muted/30'
                )}
                onClick={() => handleClick(n)}
              >
                <NotificationIcon type={n.type} read={n.read} />
                <div className="flex-1 min-w-0">
                  <p className={cn('text-xs leading-tight', !n.read && 'font-semibold')}>{n.title}</p>
                  {n.body && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[9px] text-muted-foreground/60 mt-0.5">{formatTime(n.created_at)}</p>
                </div>
                {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function NotificationIcon({ type, read }: { type: string; read: boolean }) {
  const className = cn('h-4 w-4 shrink-0 mt-0.5', read && 'opacity-50')
  switch (type) {
    case 'admin_alert':
    case 'warning':
      return <AlertTriangle className={cn(className, 'text-amber-500')} />
    case 'staff_message':
      return <MessageSquare className={cn(className, 'text-blue-500')} />
    case 'item_update':
      return <CheckCircle2 className={cn(className, 'text-green-500')} />
    default:
      return <Info className={cn(className, 'text-muted-foreground')} />
  }
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString()
}
