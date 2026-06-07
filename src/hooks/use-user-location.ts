'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export interface UserLocation {
  lat: number
  lng: number
  accuracy: number | null
}

const RETRY_DELAYS = [1000, 3000, 10000]
const MAX_RETRIES = RETRY_DELAYS.length

export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const highAccuracyRef = useRef(true)

  const startWatch = useCallback(() => {
    if (!navigator.geolocation) return

    setIsTracking(true)
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        retryCountRef.current = 0
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current)
          retryTimerRef.current = null
        }
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
        setError(null)
      },
      () => {
        if (highAccuracyRef.current) {
          highAccuracyRef.current = false
          navigator.geolocation.clearWatch(id)
          watchIdRef.current = null
          startWatch()
          return
        }

        const attempts = retryCountRef.current
        retryCountRef.current++

        if (attempts < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempts]
          setError(`GPS retrying in ${delay / 1000}s…`)
          navigator.geolocation.clearWatch(id)
          watchIdRef.current = null
          retryTimerRef.current = setTimeout(() => {
            if (mountedRef.current) startWatch()
          }, delay)
        } else {
          setError('GPS unavailable — check location permissions')
          setIsTracking(false)
        }
      },
      { enableHighAccuracy: highAccuracyRef.current, timeout: 10000, maximumAge: 5000 }
    )
    watchIdRef.current = id
  }, [])

  useEffect(() => {
    mountedRef.current = true

    if (!navigator.geolocation) {
      setError('GPS not available')
      return
    }

    startWatch()

    return () => {
      mountedRef.current = false
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }
  }, [startWatch])

  return { location, isTracking, error }
}
