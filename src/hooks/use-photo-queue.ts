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

export function usePhotoQueue() {
  const [queueCount, setQueueCount] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const processingRef = useRef(false)

  const refreshCount = useCallback(async () => {
    const count = await getQueueCount()
    setQueueCount(count)
  }, [])

  const uploadSingle = useCallback(async (photo: QueuedPhoto): Promise<boolean> => {
    if (!WEBHOOK_URL) {
      console.warn('NEXT_PUBLIC_DRIVE_WEBHOOK_URL not set — photo silently skipped')
      await markSynced(photo.id!)
      return true
    }

    try {
      const rawBase64 = stripDataPrefix(photo.dataUrl)
      const filename = `${photo.psid}_${Date.now()}.webp`

      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'upload',
          name: filename,
          data: rawBase64,
          surveyId: photo.psid,
          survey_id: photo.psid,
          email: photo.email,
          timestamp: photo.capturedAt,
        }),
      })

      if (!res.ok) throw new Error(`Webhook returned ${res.status}`)

      const result: Record<string, unknown> = await res.json()
      if (result.status !== 'success') throw new Error(result.message as string || 'Webhook returned error')

      const fileId = extractFileId(result)
      if (!fileId) throw new Error('No fileId in webhook response')

      const photoUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w640`

      const saveRes = await fetch('/api/delivery/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_item_id: photo.assignmentItemId,
          photo_url: photoUrl,
          gdrive_file_id: fileId,
          gps_lat: photo.gpsLat,
          gps_lng: photo.gpsLng,
        }),
      })

      if (!saveRes.ok) throw new Error('Failed to save photo record')

      await markSynced(photo.id!)
      return true
    } catch (err) {
      if (photo.retryCount >= MAX_RETRIES) {
        await removeFromQueue(photo.id!)
      } else {
        await incrementRetry(photo.id!)
      }
      return false
    }
  }, [])

  const processQueue = useCallback(async () => {
    if (processingRef.current || !WEBHOOK_URL) return
    processingRef.current = true
    setIsProcessing(true)
    setLastError(null)

    try {
      const photos = await getQueuedPhotos()
      for (const photo of photos) {
        const ok = await uploadSingle(photo)
        if (!ok) {
          setLastError(`Failed to upload photo for ${photo.psid}`)
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
    dataUrl: string
    email: string
    gpsLat?: number | null
    gpsLng?: number | null
  }) => {
    const id = await addToQueue({
      assignmentItemId: opts.assignmentItemId,
      psid: opts.psid,
      dataUrl: opts.dataUrl,
      capturedAt: new Date().toISOString(),
      email: opts.email,
      gpsLat: opts.gpsLat,
      gpsLng: opts.gpsLng,
    })

    await refreshCount()

    if (navigator.onLine) {
      processQueue()
    }

    return id
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
