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
import { uploadToGAS } from '@/lib/drive-upload'
import type { QueuedPhoto } from '@/lib/photo-queue'

const MAX_RETRIES = 3

export function usePhotoQueue() {
  const queueCount = usePhotoQueueStore((s) => s.queueCount)
  const setQueueCount = usePhotoQueueStore((s) => s.setQueueCount)
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [processingIndex, setProcessingIndex] = useState(0)
  const [totalToProcess, setTotalToProcess] = useState(0)
  const [currentFileSize, setCurrentFileSize] = useState('')
  const [uploadSpeed, setUploadSpeed] = useState('')
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
      setIsProcessing(false)
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
  }, [refreshCount, processQueue])

  useEffect(() => {
    refreshCount()

    fetch('/api/settings')
      .then(r => r.json())
      .then(data => { manualSyncRef.current = data?.unsent_mode?.enabled === true })
      .catch(() => {})

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
