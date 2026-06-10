'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/hooks/use-toast'
import { usePhotoQueueStore } from '@/stores/photo-queue-store'
import {
  addToQueue,
  getAllQueued,
  removeFromQueue,
  getQueueCount,
  incrementRetry,
} from '@/lib/photo-queue'
import type { QueuedPhoto } from '@/lib/photo-queue'

const MAX_RETRIES = 3

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function usePhotoQueue() {
  const queueCount = usePhotoQueueStore((s) => s.queueCount)
  const setQueueCount = usePhotoQueueStore((s) => s.setQueueCount)
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const processingRef = useRef(false)
  const manualSyncRef = useRef(false)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const refreshCount = useCallback(async () => {
    const count = await getQueueCount()
    setQueueCount(count)
  }, [])

  const processSingle = useCallback(async (photo: QueuedPhoto): Promise<'ok' | 'retry' | 'orphan'> => {
    try {
      const dataUrl = await blobToBase64(photo.photoBlob)

      const res = await fetch('/api/deliveries/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryPhotoId: photo.deliveryPhotoId,
          dataUrl,
        }),
      })

      if (!res.ok) {
        if (res.status === 404 || res.status === 403) {
          await removeFromQueue(photo.id!)
          toast(`Photo for ${photo.psid} skipped — assignment was revoked`, 'error')
          return 'orphan'
        }
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }

      const json = await res.json()
      if (json.already_synced) {
        await removeFromQueue(photo.id!)
        return 'ok'
      }

      await removeFromQueue(photo.id!)
      return 'ok'
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      if (photo.retryCount >= MAX_RETRIES) {
        await removeFromQueue(photo.id!)
        setLastError(`Photo ${photo.psid} failed after ${MAX_RETRIES} retries`)
        toast(`Photo for ${photo.psid} failed: ${errMsg}`, 'error')
        fetch('/api/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            level: 'error',
            message: `Photo ${photo.psid} failed after ${MAX_RETRIES} retries: ${errMsg}`,
            details: { psid: photo.psid, deliveryPhotoId: photo.deliveryPhotoId, retryCount: photo.retryCount },
            source: 'photo-queue',
          }),
        }).catch(() => {})
        return 'orphan'
      } else {
        await incrementRetry(photo.id!)
      }
      setLastError(`Photo ${photo.psid}: ${errMsg}`)
      return 'retry'
    }
  }, [toast])

  const processQueue = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true
    setIsProcessing(true)
    setLastError(null)

    try {
      // Loop in case new items were added while we were processing
      while (true) {
        const photos = await getAllQueued()
        if (!photos.length) break

        for (const photo of photos) {
          const result = await processSingle(photo)
          if (result === 'orphan') {
            setLastError(`Photo ${photo.psid} skipped (no longer valid)`)
          }
        }
      }

      await refreshCount()

      queryClient.invalidateQueries({ queryKey: ['delivery-photos'] })
      queryClient.invalidateQueries({ queryKey: ['staff-assignment'] })
      queryClient.invalidateQueries({ queryKey: ['assignment-totals'] })
      queryClient.invalidateQueries({ queryKey: ['staff-stats'] })
    } finally {
      processingRef.current = false
      setIsProcessing(false)
    }
  }, [processSingle, refreshCount, queryClient])

  const enqueuePhoto = useCallback(async (opts: {
    deliveryPhotoId: string
    assignmentItemId: string
    psid: string
    photoBlob: Blob
    gpsLat?: number | null
    gpsLng?: number | null
    skipAutoSync?: boolean
  }) => {
    await addToQueue({
      deliveryPhotoId: opts.deliveryPhotoId,
      assignmentItemId: opts.assignmentItemId,
      psid: opts.psid,
      photoBlob: opts.photoBlob,
      gpsLat: opts.gpsLat,
      gpsLng: opts.gpsLng,
    })

    await refreshCount()

    if (!opts.skipAutoSync && navigator.onLine) {
      processQueue()
    }
  }, [refreshCount, processQueue])

  useEffect(() => {
    refreshCount()

    fetch('/api/settings')
      .then(r => r.json())
      .then(data => { manualSyncRef.current = data?.unsent_mode?.enabled === true })
      .catch(() => { /* defaults to false */ })

    const handleOnline = () => {
      if (!manualSyncRef.current) processQueue()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [refreshCount, processQueue])

  return {
    queueCount,
    isProcessing,
    lastError,
    enqueuePhoto,
    processQueue,
    refreshCount,
  }
}
