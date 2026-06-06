'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  addUnsent,
  getAllUnsent,
  removeUnsent,
  getUnsentCount,
  incrementUnsentRetry,
} from '@/lib/unsent-photo-queue'
import type { UnsentPhoto } from '@/lib/unsent-photo-queue'

export function useUnsentPhotos() {
  const [unsentList, setUnsentList] = useState<UnsentPhoto[]>([])
  const [count, setCount] = useState(0)
  const [syncingIds, setSyncingIds] = useState<Set<number>>(new Set())

  const refresh = useCallback(async () => {
    const [list, c] = await Promise.all([getAllUnsent(), getUnsentCount()])
    setUnsentList(list)
    setCount(c)
  }, [])

  const enqueueUnsent = useCallback(async (opts: {
    assignmentItemId: string
    psid: string
    dataUrl: string
    gpsLat?: number | null
    gpsLng?: number | null
  }) => {
    await addUnsent(opts)
    await refresh()
  }, [refresh])

  const retrySingle = useCallback(async (photo: UnsentPhoto): Promise<boolean> => {
    setSyncingIds((prev) => new Set(prev).add(photo.id!))
    try {
      const res = await fetch('/api/deliveries/sync-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentItemId: photo.assignmentItemId,
          psid: photo.psid,
          dataUrl: photo.dataUrl,
          gpsLat: photo.gpsLat,
          gpsLng: photo.gpsLng,
        }),
      })

      if (!res.ok) {
        await incrementUnsentRetry(photo.id!)
        return false
      }

      await removeUnsent(photo.id!)
      await refresh()
      return true
    } catch {
      await incrementUnsentRetry(photo.id!)
      return false
    } finally {
      setSyncingIds((prev) => { const next = new Set(prev); next.delete(photo.id!); return next })
    }
  }, [refresh])

  const retryAll = useCallback(async () => {
    for (const photo of unsentList) {
      await retrySingle(photo)
    }
  }, [unsentList, retrySingle])

  const discard = useCallback(async (id: number) => {
    await removeUnsent(id)
    await refresh()
  }, [refresh])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    unsentList,
    count,
    syncingIds,
    enqueueUnsent,
    retrySingle,
    retryAll,
    discard,
    refresh,
  }
}
