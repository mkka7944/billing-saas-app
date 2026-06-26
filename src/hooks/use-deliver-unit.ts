'use client'

import { useCallback } from 'react'

export interface DeliveryResult {
  status: 'delivered' | 'processing'
  distance: number | null
  gps_lat: number | null
  gps_lng: number | null
  gps_accuracy: number | null
  delivery_photo_id: string | null
}

export function useDeliverUnit() {
  const mark = useCallback(async (
    assignmentItemId: string,
    gpsLat: number | null,
    gpsLng: number | null,
    skipPhoto: boolean,
    gpsAccuracy?: number | null,
  ): Promise<DeliveryResult | null> => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)
      const res = await fetch('/api/deliveries/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          assignmentItemId,
          gpsLat,
          gpsLng,
          skipPhoto,
          gpsAccuracy,
        }),
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `Server error — please try again (HTTP ${res.status})`)
      }

      const result: DeliveryResult = await res.json()
      return result
    } catch (e) {
      if (e instanceof TypeError) return null
      if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Request timed out — please try again')
      if (e instanceof Error) throw e
      throw new Error('Server error — please try again')
    }
  }, [])

  return { mark }
}
