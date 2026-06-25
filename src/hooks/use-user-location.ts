'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSettings } from '@/hooks/use-settings'

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

// GPS position reporting (staff phones → server)
const MOVEMENT_THRESHOLD = 50  // 50 meters

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function reportLocation(lat: number, lng: number, accuracy: number | null) {
  try {
    await fetch('/api/live/report-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, accuracy }),
    })
  } catch {
    // Silently fail — offline or network error
  }
}

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
  const { data: settings } = useSettings()
  const reportInterval = Math.max(30000, (settings?.live_poll_interval || 60) * 1000)
  const lastReport = useRef({ lat: 0, lng: 0, time: 0 })

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

  // Periodically report GPS position to server (interval controlled by admin setting)
  useEffect(() => {
    if (!reportInterval || !sharedLocation) return

    const id = setInterval(() => {
      const loc = sharedLocation
      if (!loc) return

      const now = Date.now()
      const sinceLast = now - lastReport.current.time
      const distance = lastReport.current.time
        ? haversineMeters(lastReport.current.lat, lastReport.current.lng, loc.lat, loc.lng)
        : 999

      if (sinceLast >= reportInterval && (distance >= MOVEMENT_THRESHOLD || sinceLast >= 300000)) {
        lastReport.current = { lat: loc.lat, lng: loc.lng, time: now }
        reportLocation(loc.lat, loc.lng, loc.accuracy)
      }
    }, reportInterval)

    return () => clearInterval(id)
  }, [reportInterval])

  return { location: sharedLocation, isTracking: sharedIsTracking, error: sharedError }
}
