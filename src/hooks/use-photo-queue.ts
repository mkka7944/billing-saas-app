'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/hooks/use-toast'
import { useSettings } from '@/hooks/use-settings'
import { usePhotoQueueStore } from '@/stores/photo-queue-store'
import {
  addToQueue,
  getAllQueued,
  removeFromQueue,
  getQueueCount,
  incrementRetry,
  markFailed,
} from '@/lib/photo-queue'
import { uploadToGAS } from '@/lib/drive-upload'
import type { QueuedPhoto } from '@/lib/photo-queue'

export function usePhotoQueue() {
  const queueCount = usePhotoQueueStore((s) => s.queueCount)
  const isProcessing = usePhotoQueueStore((s) => s.isProcessing)
  const lastError = usePhotoQueueStore((s) => s.lastError)
  const processingIndex = usePhotoQueueStore((s) => s.processingIndex)
  const totalToProcess = usePhotoQueueStore((s) => s.totalToProcess)
  const currentFileSize = usePhotoQueueStore((s) => s.currentFileSize)
  const uploadSpeed = usePhotoQueueStore((s) => s.uploadSpeed)
  const setQueueCount = usePhotoQueueStore((s) => s.setQueueCount)
  const setProcessing = usePhotoQueueStore((s) => s.setProcessing)
  const setProcessingIndex = usePhotoQueueStore((s) => s.setProcessingIndex)
  const setTotalToProcess = usePhotoQueueStore((s) => s.setTotalToProcess)
  const setCurrentFileSize = usePhotoQueueStore((s) => s.setCurrentFileSize)
  const setUploadSpeed = usePhotoQueueStore((s) => s.setUploadSpeed)
  const setLastError = usePhotoQueueStore((s) => s.setLastError)
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
      const gdriveFileId = await uploadToGAS(photo.photoBlob, photo.surveyId, photo.email)

      const res = await fetch('/api/deliveries/sync-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryPhotoId: photo.deliveryPhotoId,
          gdriveFileId,
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
      await markFailed(photo.id!, errMsg)
      await incrementRetry(photo.id!)
      setLastError(`Photo ${photo.psid}: ${errMsg} (attempt ${photo.retryCount + 1})`)

      // Exponential backoff: wait longer between retries
      const delay = Math.min((photo.retryCount + 1) * 5000, 60000)
      await new Promise(r => setTimeout(r, delay))

      return 'retry'
    }
  }, [toast])

  const processQueue = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true
    setProcessing(true)
    setLastError(null)

    try {
      while (true) {
        const photos = await getAllQueued()
        if (!photos.length) break

        setTotalToProcess(photos.length)

        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i]
          setProcessingIndex(i)

          const sizeKB = Math.round(photo.photoBlob.size / 1024)
          setCurrentFileSize(sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`)

          const startTime = Date.now()
          const result = await processSingle(photo)
          const elapsed = Date.now() - startTime

          if (elapsed > 0 && photo.photoBlob.size > 0) {
            const speed = (photo.photoBlob.size / 1024) / (elapsed / 1000)
            setUploadSpeed(speed >= 1024 ? `${(speed / 1024).toFixed(1)} MB/s` : `${speed.toFixed(1)} KB/s`)
          } else {
            setUploadSpeed('')
          }

          if (result === 'orphan') {
            setLastError(`Photo ${photo.psid} skipped (no longer valid)`)
          }
        }
      }

      await refreshCount()
      setProcessingIndex(0)
      setTotalToProcess(0)
      setCurrentFileSize('')
      setUploadSpeed('')

      queryClient.invalidateQueries({ queryKey: ['delivery-photos'] })
      queryClient.invalidateQueries({ queryKey: ['staff-assignment'] })
      queryClient.invalidateQueries({ queryKey: ['assignment-totals'] })
      queryClient.invalidateQueries({ queryKey: ['staff-stats'] })
    } finally {
      processingRef.current = false
      setProcessing(false)
    }
  }, [processSingle, refreshCount, queryClient])

  const enqueuePhoto = useCallback(async (opts: {
    deliveryPhotoId: string
    assignmentItemId: string
    psid: string
    surveyId: string
    email: string
    photoBlob: Blob
    gpsLat?: number | null
    gpsLng?: number | null
    skipAutoSync?: boolean
  }) => {
    await addToQueue({
      deliveryPhotoId: opts.deliveryPhotoId,
      assignmentItemId: opts.assignmentItemId,
      psid: opts.psid,
      surveyId: opts.surveyId,
      email: opts.email,
      photoBlob: opts.photoBlob,
      gpsLat: opts.gpsLat,
      gpsLng: opts.gpsLng,
    })

    await refreshCount()

    if (!opts.skipAutoSync && navigator.onLine) {
      processQueue()
    }

    // Register background sync for failed uploads (Chrome/Android)
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const reg = await navigator.serviceWorker.ready
        await (reg as any).sync.register('sync-photos')
      } catch {
        // Background Sync not supported (Firefox, iOS) — fallback to online event
      }
    }
  }, [refreshCount, processQueue])

  const { data: appSettings } = useSettings()

  useEffect(() => {
    manualSyncRef.current = appSettings?.unsent_mode?.enabled === true
  }, [appSettings])

  useEffect(() => {
    // Request persistent storage so browser doesn't evict the photo queue
    if (navigator.storage?.persist) {
      navigator.storage.persist().then((persisted) => {
        if (persisted) {
          console.log('Persistent storage granted — photo queue protected')
        }
      })
    }

    refreshCount()

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
    processingIndex,
    totalToProcess,
    currentFileSize,
    uploadSpeed,
    enqueuePhoto,
    processQueue,
    refreshCount,
  }
}
