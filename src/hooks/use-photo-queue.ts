'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  addToQueue,
  getQueuedPhotos,
  markSynced,
  incrementRetry,
  removeFromQueue,
  getQueueCount,
  clearSynced,
} from '@/lib/photo-queue'
import type { QueuedPhoto } from '@/lib/photo-queue'

const MAX_RETRIES = 3
const WEBHOOK_URL = process.env.NEXT_PUBLIC_DRIVE_WEBHOOK_URL

function extractFileId(res: Record<string, unknown>): string | null {
  return (
    (res.fileId as string) ||
    (res.id as string) ||
    (res.file_id as string) ||
    ((res.data as Record<string, unknown>)?.id as string) ||
    ((res.data as Record<string, unknown>)?.fileId as string) ||
    null
  )
}

function stripDataPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(',')
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function resolvePhotoData(photo: QueuedPhoto): Promise<string> {
  if (photo.dataUrl) return photo.dataUrl
  if (photo.photoBlob) return blobToBase64(photo.photoBlob)
  throw new Error('No photo data available')
}

export function usePhotoQueue() {
  const [queueCount, setQueueCount] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const processingRef = useRef(false)

  const refreshCount = useCallback(async () => {
    const count = await getQueueCount()
    setQueueCount(count)
  }, [])

  const uploadSingle = useCallback(async (photo: QueuedPhoto): Promise<'ok' | 'retry' | 'orphan'> => {
    if (!WEBHOOK_URL) {
      console.warn('NEXT_PUBLIC_DRIVE_WEBHOOK_URL not set — photo silently skipped')
      await markSynced(photo.id!)
      return 'ok'
    }

    try {
      const dataUrl = await resolvePhotoData(photo)
      const rawBase64 = stripDataPrefix(dataUrl)
      const fileKey = photo.surveyId || photo.psid
      const filename = `${fileKey}_${Date.now()}.webp`

      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'upload',
          name: filename,
          data: rawBase64,
          surveyId: fileKey,
          survey_id: fileKey,
          email: photo.email,
          timestamp: photo.capturedAt,
        }),
      })

      if (!res.ok) throw new Error(`Webhook returned ${res.status}`)

      const result: Record<string, unknown> = await res.json()
      if (result.status !== 'success') throw new Error(result.message as string || 'Webhook returned error')

      const fileId = extractFileId(result)
      if (!fileId) throw new Error('No fileId in webhook response')

      const photoUrl = `/api/delivery/photo/${fileId}`

      const promoteRes = await fetch('/api/deliveries/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentItemId: photo.assignmentItemId,
          photoUrl,
          gdriveFileId: fileId,
          gpsLat: photo.gpsLat,
          gpsLng: photo.gpsLng,
        }),
      })

      if (!promoteRes.ok) {
        if (promoteRes.status === 403 || promoteRes.status === 404) {
          await removeFromQueue(photo.id!)
          return 'orphan'
        }
        const errBody = await promoteRes.json().catch(() => ({ error: 'Promote failed' }))
        throw new Error(errBody.error || 'Failed to promote delivery')
      }

      await markSynced(photo.id!)
      return 'ok'
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      if (photo.retryCount >= MAX_RETRIES) {
        await removeFromQueue(photo.id!)
      } else {
        await incrementRetry(photo.id!)
      }
      setLastError(`Photo ${photo.psid}: ${errMsg}`)
      return 'retry'
    }
  }, [])

  const processQueue = useCallback(async () => {
    if (processingRef.current || !WEBHOOK_URL) return
    processingRef.current = true
    setIsProcessing(true)
    setLastError(null)

    try {
      const photos = await getQueuedPhotos()
      const batchSize = 3
      for (let i = 0; i < photos.length; i += batchSize) {
        const batch = photos.slice(i, i + batchSize)
        const results = await Promise.allSettled(batch.map((p) => uploadSingle(p)))
        for (let j = 0; j < results.length; j++) {
          const result = results[j]
          const photo = batch[j]
          if (result.status === 'rejected') {
            setLastError(`Failed to upload photo for ${photo.psid}: ${result.reason}`)
          } else if (result.value === 'orphan') {
            setLastError(`Photo for ${photo.psid} skipped (assignment no longer active)`)
          } else if (result.value === 'retry') {
            setLastError(`Failed to upload photo for ${photo.psid}`)
          }
        }
      }
      await clearSynced()
      await refreshCount()
    } finally {
      processingRef.current = false
      setIsProcessing(false)
    }
  }, [uploadSingle, refreshCount])

  const enqueuePhoto = useCallback(async (opts: {
    assignmentItemId: string
    psid: string
    surveyId?: string | null
    photoBlob: Blob
    email: string
    gpsLat?: number | null
    gpsLng?: number | null
    skipAutoSync?: boolean
  }) => {
    const id = await addToQueue({
      assignmentItemId: opts.assignmentItemId,
      psid: opts.psid,
      surveyId: opts.surveyId || undefined,
      photoBlob: opts.photoBlob,
      capturedAt: new Date().toISOString(),
      email: opts.email,
      gpsLat: opts.gpsLat,
      gpsLng: opts.gpsLng,
    })

    await refreshCount()

    if (!opts.skipAutoSync && navigator.onLine) {
      processQueue()
    }

    return id
  }, [refreshCount, processQueue])

  // sendBeacon flush on tab close — best-effort
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (queueCount === 0) return
      try {
        navigator.sendBeacon('/api/deliveries/ping')
      } catch {
        // ignore
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [queueCount])

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
