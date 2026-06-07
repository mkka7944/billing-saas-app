'use client'

import { useState, useCallback } from 'react'
import { compressImage } from '@/lib/image/compress'

function captureGPS(timeout = 3000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }
    const timer = setTimeout(() => resolve(null), timeout)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer)
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      },
      { enableHighAccuracy: false, timeout, maximumAge: 5000 }
    )
  })
}

export type DeliveryProgress = 'idle' | 'compressing' | 'uploading' | 'saving' | 'done'

export interface DeliveryResult {
  status: 'delivered' | 'processing'
  distance: number | null
  photo_url: string | null
  gps_lat: number | null
  gps_lng: number | null
  target_lat: number | null
  target_lng: number | null
}

export function useDeliverUnit() {
  const [isDelivering, setIsDelivering] = useState(false)
  const [lastResult, setLastResult] = useState<DeliveryResult | null>(null)
  const [progress, setProgress] = useState<DeliveryProgress>('idle')

  const resetProgress = useCallback(() => {
    setProgress('idle')
    setIsDelivering(false)
  }, [])

  const deliver = useCallback(async (
    assignmentItemId: string,
    psid: string,
    photoFile: File,
    targetLat: number | null,
    targetLng: number | null,
    gpsOverride?: { lat: number; lng: number } | null,
  ): Promise<DeliveryResult | null> => {
    setIsDelivering(true)
    setLastResult(null)
    setProgress('compressing')

    try {
      const gps = gpsOverride ?? await captureGPS()

      const compressed = await compressImage(photoFile)

      setProgress('uploading')

      const form = new FormData()
      form.append('photo', compressed, `${psid}_delivery.webp`)
      form.append('assignment_item_id', assignmentItemId)
      form.append('psid', psid)
      if (gps) {
        form.append('gps_lat', String(gps.lat))
        form.append('gps_lng', String(gps.lng))
      }
      if (targetLat != null) form.append('target_lat', String(targetLat))
      if (targetLng != null) form.append('target_lng', String(targetLng))

      const res = await fetch('/api/deliveries/mark', { method: 'POST', body: form })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }

      setProgress('saving')

      const result: DeliveryResult = await res.json()
      setLastResult(result)
      setProgress('done')
      return result
    } catch (e) {
      resetProgress()
      if (e instanceof TypeError) {
        return null
      }
      throw e
    }
  }, [resetProgress])

  const deliverNoPhoto = useCallback(async (
    assignmentItemId: string,
    psid: string,
    targetLat: number | null,
    targetLng: number | null,
    gpsOverride?: { lat: number; lng: number } | null,
  ): Promise<DeliveryResult | null> => {
    setIsDelivering(true)
    setLastResult(null)
    setProgress('uploading')

    try {
      const gps = gpsOverride ?? await captureGPS()

      const form = new FormData()
      form.append('skip_photo', 'true')
      form.append('assignment_item_id', assignmentItemId)
      form.append('psid', psid)
      if (gps) {
        form.append('gps_lat', String(gps.lat))
        form.append('gps_lng', String(gps.lng))
      }
      if (targetLat != null) form.append('target_lat', String(targetLat))
      if (targetLng != null) form.append('target_lng', String(targetLng))

      const res = await fetch('/api/deliveries/mark', { method: 'POST', body: form })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }

      setProgress('saving')

      const result: DeliveryResult = await res.json()
      setLastResult(result)
      setProgress('done')
      return result
    } catch (e) {
      resetProgress()
      if (e instanceof TypeError) {
        return null
      }
      throw e
    }
  }, [resetProgress])

  return { deliver, deliverNoPhoto, isDelivering, lastResult, progress }
}
