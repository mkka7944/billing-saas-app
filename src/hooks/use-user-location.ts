'use client'

import { useState, useEffect, useRef } from 'react'

export interface UserLocation {
  lat: number
  lng: number
  accuracy: number | null
}

export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const watchIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('GPS not available')
      return
    }

    setIsTracking(true)
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
        setError(null)
      },
      (err) => {
        setError(err.message)
        setIsTracking(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    )
    watchIdRef.current = id

    return () => {
      navigator.geolocation.clearWatch(id)
      watchIdRef.current = null
    }
  }, [])

  return { location, isTracking, error }
}
