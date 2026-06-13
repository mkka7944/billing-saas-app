'use client'

import { useState, useEffect, useCallback } from 'react'

export interface UserLocation {
  lat: number
  lng: number
  accuracy: number | null
}

const RETRY_DELAYS = [1000, 3000, 10000]
const MAX_RETRIES = RETRY_DELAYS.length

type Listener = () => void

let sharedLocation: UserLocation | null = null
let sharedIsTracking = false
let sharedError: string | null = null
let watchId: number | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryCount = 0
let highAccuracy = true
let watcherCount = 0
let mounted = true
const listeners = new Set<Listener>()

function notifyListeners() {
  listeners.forEach((fn) => fn())
}

function startWatch() {
  if (!navigator.geolocation) return

  sharedIsTracking = true
  notifyListeners()
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      retryCount = 0
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      sharedLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }
      sharedError = null
      notifyListeners()
    },
    () => {
      if (highAccuracy) {
        highAccuracy = false
        navigator.geolocation.clearWatch(id)
        watchId = null
        startWatch()
        return
      }

      const attempts = retryCount
      retryCount++

      if (attempts < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempts]
        sharedError = `GPS retrying in ${delay / 1000}s…`
        notifyListeners()
        navigator.geolocation.clearWatch(id)
        watchId = null
        retryTimer = setTimeout(() => {
          if (mounted) startWatch()
        }, delay)
      } else {
        sharedError = 'GPS unavailable — check location permissions'
        sharedIsTracking = false
        notifyListeners()
      }
    },
    { enableHighAccuracy: highAccuracy, timeout: 10000, maximumAge: 5000 },
  )
  watchId = id
}

function stopWatch() {
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  sharedIsTracking = false
}

export function useUserLocation() {
  const [, forceUpdate] = useState(0)

  const notify = useCallback(() => forceUpdate((n) => n + 1), [])

  useEffect(() => {
    watcherCount++
    if (watcherCount === 1) {
      mounted = true
      highAccuracy = true
      retryCount = 0
      if (navigator.geolocation) {
        startWatch()
      } else {
        sharedError = 'GPS not available'
        notifyListeners()
      }
    }
    listeners.add(notify)
    return () => {
      watcherCount--
      listeners.delete(notify)
      if (watcherCount === 0) {
        mounted = false
        stopWatch()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { location: sharedLocation, isTracking: sharedIsTracking, error: sharedError }
}
