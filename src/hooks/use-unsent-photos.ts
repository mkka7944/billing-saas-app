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

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function resolvePhotoData(photo: UnsentPhoto): Promise<string> {
  if (photo.dataUrl) return photo.dataUrl
  if (photo.photoBlob) return blobToDataUrl(photo.photoBlob)
  throw new Error('No photo data available')
}

export function useUnsentPhotos(refreshIntervalMs?: number) {
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
    surveyId?: string | null
    photoBlob: Blob
    gpsLat?: number | null
    gpsLng?: number | null
  }) => {
    await addUnsent({ ...opts, surveyId: opts.surveyId || undefined })
    await refresh()
  }, [refresh])

  const retrySingle = useCallback(async (photo: UnsentPhoto): Promise<boolean> => {
    setSyncingIds((prev) => new Set(prev).add(photo.id!))
    try {
      const dataUrl = await resolvePhotoData(photo)

      const res = await fetch('/api/deliveries/sync-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentItemId: photo.assignmentItemId,
          psid: photo.psid,
          survey_id: photo.surveyId,
          dataUrl,
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

  useEffect(() => {
    if (!refreshIntervalMs) return
    const timer = setInterval(refresh, refreshIntervalMs)
    return () => clearInterval(timer)
  }, [refresh, refreshIntervalMs])

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
