'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
  const [queueCount, setQueueCount] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const processingRef = useRef(false)
  const queryClient = useQueryClient()

  const refreshCount = useCallback(async () => {
    const count = await getQueueCount()
    setQueueCount(count)
  }, [])

  const processSingle = useCallback(async (photo: QueuedPhoto): Promise<'ok' | 'retry' | 'orphan'> => {
    try {
      const dataUrl = await blobToBase64(photo.photoBlob)

      const res = await fetch('/api/deliveries/sync-photo', {
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
          return 'orphan'
        }
        throw new Error(`Sync returned ${res.status}`)
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
        return 'orphan'
      } else {
        await incrementRetry(photo.id!)
      }
      setLastError(`Photo ${photo.psid}: ${errMsg}`)
      return 'retry'
    }
  }, [])

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

    if (navigator.onLine) {
      processQueue()
    }
  }, [refreshCount, processQueue])

  useEffect(() => {
    refreshCount()

    const handleOnline = () => processQueue()
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
