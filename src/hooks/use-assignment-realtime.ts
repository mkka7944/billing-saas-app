'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getAllQueued, removeFromQueue } from '@/lib/photo-queue'

async function cleanOrphanedEntries(validItemIds: Set<string>) {
  const queue = await getAllQueued()
  const removals: Promise<void>[] = []
  for (const entry of queue) {
    if (entry.id && !validItemIds.has(entry.assignmentItemId)) {
      removals.push(removeFromQueue(entry.id))
    }
  }
  if (removals.length > 0) {
    await Promise.all(removals)
  }
}

export function useAssignmentRealtime(userId: string | null) {
  const queryClient = useQueryClient()
  const lastItemIdsRef = useRef<string[]>([])

  useEffect(() => {
    if (!userId) return

    const sync = async () => {
      try {
        const res = await fetch(`/api/assignments?staff_id=${userId}`)
        if (!res.ok) return
        const { items }: { items: { id: string }[] } = await res.json()
        const currentIds = items.map((i) => i.id)
        const newIds = new Set(currentIds)

        // Clean orphaned IndexedDB entries
        await cleanOrphanedEntries(newIds)

        // If items changed, invalidate React Query cache
        const prevIds = lastItemIdsRef.current
        if (
          prevIds.length !== currentIds.length ||
          prevIds.some((id, i) => id !== currentIds[i])
        ) {
          queryClient.invalidateQueries({ queryKey: ['staff-assignment', userId] })
        }
        lastItemIdsRef.current = currentIds
      } catch {
        // best-effort — network error, will retry on next interval
      }
    }

    // Run immediately on mount
    sync()

    // Poll every 30s
    const timer = setInterval(sync, 30_000)

    // Also sync when tab regains focus
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sync()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [userId, queryClient])
}
