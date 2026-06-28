'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import type { Notification } from '@/types'

interface NotificationsResponse {
  notifications: Notification[]
  unread_count: number
  summary: { pending: number; processing: number } | null
}

import { useSettings } from '@/hooks/use-settings'

export function useNotifications() {
  const pathname = usePathname()
  const isDeliver = pathname?.startsWith('/deliver')
  const { data: settings } = useSettings()
  const enabled = settings?.notifications_polling_enabled !== false && !isDeliver
  const interval = Math.max(30000, (settings?.notifications_poll_interval || 120) * 1000)

  return useQuery<NotificationsResponse>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications?limit=20')
      if (!res.ok) throw new Error('Failed to fetch notifications')
      return res.json()
    },
    refetchInterval: enabled ? interval : false,
    refetchOnWindowFocus: !isDeliver,
    staleTime: enabled ? Math.max(interval - 10000, 10000) : 5 * 60 * 1000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Failed to mark read')
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      if (!res.ok) throw new Error('Failed to mark all read')
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
