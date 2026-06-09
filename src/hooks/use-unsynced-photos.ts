'use client'

import { useState, useCallback, useEffect } from 'react'

export interface UnsyncedPhoto {
  id: string
  assignment_item_id: string
  psid: string
  gps_lat: number | null
  gps_lng: number | null
  captured_at: string
}

export function useUnsyncedPhotos(refreshIntervalMs?: number) {
  const [photos, setPhotos] = useState<UnsyncedPhoto[]>([])
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/deliveries/unsynced')
      if (!res.ok) return
      const json = await res.json()
      setPhotos(json.photos || [])
      setCount(json.count || 0)
    } catch {
      // best-effort
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!refreshIntervalMs) return
    const timer = setInterval(refresh, refreshIntervalMs)
    return () => clearInterval(timer)
  }, [refresh, refreshIntervalMs])

  return { photos, count, refresh }
}
