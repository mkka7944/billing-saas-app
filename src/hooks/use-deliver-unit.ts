'use client'

import { useState, useCallback } from 'react'

export type DeliveryProgress = 'idle' | 'saving' | 'done'

export interface DeliveryResult {
  status: 'delivered' | 'processing'
  distance: number | null
  gps_lat: number | null
  gps_lng: number | null
  delivery_photo_id: string | null
}

export function useDeliverUnit() {
  const [isDelivering, setIsDelivering] = useState(false)
  const [lastResult, setLastResult] = useState<DeliveryResult | null>(null)
  const [progress, setProgress] = useState<DeliveryProgress>('idle')

  const reset = useCallback(() => {
    setProgress('idle')
    setIsDelivering(false)
    setLastResult(null)
  }, [])

  const mark = useCallback(async (
    assignmentItemId: string,
    psid: string,
    gpsLat: number | null,
    gpsLng: number | null,
    targetLat: number | null,
    targetLng: number | null,
    skipPhoto: boolean,
  ): Promise<DeliveryResult | null> => {
    setIsDelivering(true)
    setProgress('saving')

    try {
      const res = await fetch('/api/deliveries/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentItemId,
          psid,
          gpsLat,
          gpsLng,
          targetLat,
          targetLng,
          skipPhoto,
        }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }

      const result: DeliveryResult = await res.json()
      setLastResult(result)
      setProgress('done')
      return result
    } catch (e) {
      reset()
      if (e instanceof TypeError) {
        return null
      }
      throw e
    }
  }, [reset])

  return { mark, isDelivering, lastResult, progress }
}
