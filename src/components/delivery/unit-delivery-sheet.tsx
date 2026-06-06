'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, Loader2, X, Image, MapPin, CheckCircle2, ChevronRight, ChevronLeft, Crosshair } from 'lucide-react'
import { useDeliveryPhotos } from '@/hooks/use-delivery-photos'
import { useDeliverUnit } from '@/hooks/use-deliver-unit'
import { usePhotoQueue } from '@/hooks/use-photo-queue'
import { useAuthStore } from '@/stores/auth-store'
import { compressImage } from '@/lib/image/compress'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import type { AssignmentItemUnit, AssignmentItemWithUnit } from '@/types'

interface UnitDeliverySheetProps {
  unit: AssignmentItemUnit | null
  assignmentItemId: string | null
  onViewDetails?: () => void
  onPrev?: () => void
  onNext?: () => void
  onClose?: () => void
}

export default function UnitDeliverySheet({
  unit,
  assignmentItemId,
  onViewDetails,
  onPrev,
  onNext,
  onClose,
}: UnitDeliverySheetProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDelivering, setIsDelivering] = useState(false)
  const [deliveryStatus, setDeliveryStatus] = useState<'idle' | 'delivered' | 'processing'>('idle')
  const [deliveryDistance, setDeliveryDistance] = useState<number | null>(null)
  const [deliveryGpsLat, setDeliveryGpsLat] = useState<number | null>(null)
  const [deliveryGpsLng, setDeliveryGpsLng] = useState<number | null>(null)
  const [liveDistance, setLiveDistance] = useState<number | null>(null)
  const [liveGpsStatus, setLiveGpsStatus] = useState<'idle' | 'locating' | 'ready' | 'unavailable'>('idle')
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [forceCompleting, setForceCompleting] = useState(false)
  const touchXRef = useRef<number | null>(null)
  const watchIdRef = useRef<number | null>(null)

  const queryClient = useQueryClient()
  const { data: previousPhotos = [] } = useDeliveryPhotos(unit?.psid || null)
  const { deliver } = useDeliverUnit()
  const { enqueuePhoto } = usePhotoQueue()
  const userId = useAuthStore((s) => s.user?.id)
  const email = useAuthStore((s) => s.user?.email)
  const roleName = useAuthStore((s) => s.roleName)
  const isAdmin = roleName === 'admin' || roleName === 'super_admin'
  const { toast } = useToast()
  const confirm = useConfirm()

  function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000
    const toRad = (d: number) => (d * Math.PI) / 180
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  useEffect(() => {
    setDeliveryStatus('idle')
    setIsDelivering(false)
    setDeliveryDistance(null)
    setDeliveryGpsLat(null)
    setDeliveryGpsLng(null)
    setUserLat(null)
    setUserLng(null)
  }, [unit?.psid])

  // Live GPS tracking — watch position while sheet is idle
  useEffect(() => {
    if (!unit?.lat || !unit?.lng || deliveryStatus !== 'idle' || !navigator.geolocation) {
      setLiveDistance(null)
      setLiveGpsStatus('idle')
      return
    }

    setLiveGpsStatus('locating')
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const d = Math.round(haversine(pos.coords.latitude, pos.coords.longitude, unit.lat!, unit.lng!))
        setLiveDistance(d)
        setUserLat(pos.coords.latitude)
        setUserLng(pos.coords.longitude)
        setLiveGpsStatus('ready')
      },
      () => {
        setLiveGpsStatus('unavailable')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    )
    watchIdRef.current = id
    return () => {
      navigator.geolocation.clearWatch(id)
      watchIdRef.current = null
    }
  }, [unit?.lat, unit?.lng, unit?.psid, deliveryStatus])

  // Cleanup watch on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  // Auto-advance after successful delivery
  useEffect(() => {
    if (deliveryStatus === 'delivered' || deliveryStatus === 'processing') {
      const timer = setTimeout(() => onNext?.(), 2000)
      return () => clearTimeout(timer)
    }
  }, [deliveryStatus, onNext])

  const openCamera = useCallback(() => {
    if (!inputRef.current) return
    inputRef.current.accept = 'image/*'
    inputRef.current.capture = 'environment'
    inputRef.current.click()
  }, [])

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/') || !assignmentItemId || !unit?.psid) return

    const gpsOverride = userLat != null && userLng != null ? { lat: userLat, lng: userLng } : null

    // 1. Try online delivery (uses pre-warmed GPS from live tracking if available)
    let result: Awaited<ReturnType<typeof deliver>> = null
    try {
      result = await deliver(
        assignmentItemId,
        unit.psid,
        file,
        unit.lat,
        unit.lng,
        gpsOverride,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Server error'
      toast(msg, 'error')
      setIsDelivering(false)
      return
    }

    if (result) {
      setDeliveryStatus(result.status)
      setDeliveryDistance(result.distance)
      setDeliveryGpsLat(result.gps_lat)
      setDeliveryGpsLng(result.gps_lng)

      // Optimistic cache update — flip status immediately
      if (userId) {
        queryClient.setQueryData<{ data: unknown; items: AssignmentItemWithUnit[] }>(
          ['staff-assignment', userId],
          (old) => {
            if (!old) return old
            return {
              ...old,
              items: old.items.map((item) =>
                item.id === assignmentItemId
                  ? { ...item, status: result.status, delivered_at: new Date().toISOString() }
                  : item
              ),
            }
          }
        )
      }
      queryClient.invalidateQueries({ queryKey: ['staff-assignment'] })
      queryClient.invalidateQueries({ queryKey: ['assignment-totals'] })
      queryClient.invalidateQueries({ queryKey: ['staff-stats'] })

      // Auto-advance: 2s for delivered, 3.5s for processing
      const delay = result.status === 'delivered' ? 2000 : 3500
      setTimeout(() => {
        setIsDelivering(false)
        onClose?.()
      }, delay)
      return
    }

    // 2. Offline fallback — compress + enqueue to IndexedDB
    try {
      const compressed = await compressImage(file)
      const reader = new FileReader()
      reader.onloadend = async () => {
        await enqueuePhoto({
          assignmentItemId,
          psid: unit.psid,
          dataUrl: reader.result as string,
          email: email || '',
        })
        setDeliveryStatus('processing')
        setIsDelivering(false)
      }
      reader.readAsDataURL(compressed)
    } catch {
      toast('Failed to save photo offline', 'error')
      setIsDelivering(false)
    }
  }, [assignmentItemId, unit?.psid, unit?.lat, unit?.lng, email, deliver, enqueuePhoto, toast, userLat, userLng, queryClient])

  const handleForceComplete = useCallback(async () => {
    if (!unit?.psid) return
    const ok = await confirm({
      title: 'Force Complete',
      message: `Mark PSID ${unit.psid} as delivered? This bypasses GPS verification.`,
      confirmLabel: 'Mark Delivered',
      variant: 'destructive',
    })
    if (!ok) return
    setForceCompleting(true)
    try {
      const res = await fetch('/api/deliveries/force', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ psid: unit.psid }),
      })
      if (res.ok) {
        toast('Marked as delivered', 'success')
        queryClient.invalidateQueries({ queryKey: ['staff-assignment'] })
        queryClient.invalidateQueries({ queryKey: ['assignment-totals'] })
        queryClient.invalidateQueries({ queryKey: ['staff-stats'] })
        setDeliveryStatus('delivered')
        onClose?.()
      } else {
        const j = await res.json()
        toast(j.error || 'Failed to mark delivered', 'error')
      }
    } catch {
      toast('Network error', 'error')
    } finally {
      setForceCompleting(false)
    }
  }, [unit?.psid, confirm, toast, queryClient, onClose])

  if (!unit) return null

  const totalDue = (unit.monthly_fee ?? 0) + (unit.arrears ?? 0)
  const displayImage = unit.image_urls?.[0] || null

  return (
    <div className="fixed bottom-0 inset-x-0 z-[1001] flex flex-col rounded-t-2xl overflow-hidden shadow-2xl bg-background max-h-[80vh] min-h-[300px] mx-auto w-full max-w-md">
      {/* Full-bleed hero image with everything overlaid */}
      <div
        className="relative flex-1 min-h-[300px]"
        onTouchStart={(e) => { touchXRef.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          if (touchXRef.current == null) return
          const dx = e.changedTouches[0].clientX - touchXRef.current
          touchXRef.current = null
          if (Math.abs(dx) > 50) {
            if (dx > 0) onPrev?.()
            else onNext?.()
          }
        }}
      >
        {/* Background image or gradient fallback */}
        {displayImage ? (
          <img
            src={displayImage}
            alt=""
            className="w-full h-full absolute inset-0 object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900" />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />

        {/* Survey ID badge — top right */}
        {unit.survey_id && (
          <div className="absolute top-3 right-3 z-20 bg-black/50 text-white/80 text-[10px] px-2 py-0.5 rounded font-mono backdrop-blur-sm">
            #{unit.survey_id}
          </div>
        )}

        {/* Previous photos badge */}
        {deliveryStatus === 'idle' && previousPhotos.length > 0 && (
          <div className="absolute top-3 right-3 bg-black/50 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-sm z-10">
            <Image className="h-3 w-3" /> {previousPhotos.length}
          </div>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 left-3 z-20 h-8 w-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Navigation arrows */}
        {onPrev && (
          <button
            onTouchEnd={(e) => { e.stopPropagation(); touchXRef.current = null }}
            onClick={(e) => { e.stopPropagation(); onPrev() }}
            className="absolute left-0 top-1/3 -translate-y-1/2 z-20 h-12 w-10 flex items-center justify-center bg-black/5 text-white/50 hover:bg-black/20 hover:text-white/90 rounded-r-lg backdrop-blur-sm cursor-pointer transition-all"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {onNext && (
          <button
            onTouchEnd={(e) => { e.stopPropagation(); touchXRef.current = null }}
            onClick={(e) => { e.stopPropagation(); onNext() }}
            className="absolute right-0 top-1/3 -translate-y-1/2 z-20 h-12 w-10 flex items-center justify-center bg-black/5 text-white/50 hover:bg-black/20 hover:text-white/90 rounded-l-lg backdrop-blur-sm cursor-pointer transition-all"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {/* Delivered overlay */}
        {deliveryStatus !== 'idle' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="flex flex-col items-center gap-1.5 text-white">
              <div className={`h-14 w-14 rounded-full flex items-center justify-center backdrop-blur-sm ${deliveryStatus === 'processing' ? 'bg-amber-500/80' : 'bg-green-500/80'}`}>
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <span className="text-sm font-bold">{deliveryStatus === 'processing' ? 'Processing' : 'Delivered'}</span>
              {deliveryStatus === 'processing' && deliveryDistance == null && (
                <span className="text-[10px] text-white/70">Saved — Awaiting GPS Verification</span>
              )}
              {deliveryStatus === 'processing' && deliveryDistance != null && (
                <span className="text-[10px] text-white/70">Out of range — Awaiting Review</span>
              )}
              {deliveryDistance != null && (
                <span className="text-[10px] text-white/70">{deliveryDistance}m from target</span>
              )}
              {deliveryGpsLat != null && deliveryGpsLng != null && (
                <span className="text-[10px] text-white/50 font-mono">
                  {deliveryGpsLat.toFixed(4)}, {deliveryGpsLng.toFixed(4)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Bottom content — info + actions on the image */}
        <div className="absolute bottom-0 left-0 right-0 p-4 pb-5 z-10 flex flex-col gap-3">
          {/* Consumer info */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-white truncate">{unit.consumer_name || 'Unknown'}</p>
              {unit.address && (
                <p className="text-xs text-white/70 truncate mt-0.5">{unit.address}</p>
              )}
              {unit.uc_name && (
                <span className="inline-flex items-center gap-1 text-[11px] text-white/50 mt-1">
                  <MapPin className="h-3 w-3" /> {unit.uc_name}
                </span>
              )}
            </div>
            {totalDue > 0 && (
              <div className="shrink-0 text-right">
                <p className="text-[10px] text-white/50 uppercase tracking-wide">Amount</p>
                <p className="text-sm font-bold text-white">Rs.{totalDue.toLocaleString()}</p>
              </div>
            )}
          </div>

          {/* Live GPS distance indicator */}
          {deliveryStatus === 'idle' && liveGpsStatus !== 'idle' && unit?.lat && unit?.lng && (
            <div className={cn(
              'flex items-center gap-1.5 text-[11px] font-medium',
              liveGpsStatus === 'locating' && 'text-white/50',
              liveGpsStatus === 'unavailable' && 'text-white/40',
              liveGpsStatus === 'ready' && liveDistance != null && liveDistance <= 50 && 'text-green-400',
              liveGpsStatus === 'ready' && liveDistance != null && liveDistance > 50 && liveDistance <= 200 && 'text-amber-400',
              liveGpsStatus === 'ready' && liveDistance != null && liveDistance > 200 && 'text-white/70',
            )}>
              <Crosshair className="h-3 w-3" />
              {liveGpsStatus === 'locating' && <span>Locating your position...</span>}
              {liveGpsStatus === 'unavailable' && <span>GPS unavailable — proceed manually</span>}
              {liveGpsStatus === 'ready' && liveDistance != null && (
                <span>{liveDistance >= 1000 ? `${(liveDistance / 1000).toFixed(1)} km` : `${liveDistance} m`} away</span>
              )}
            </div>
          )}

          {/* Action buttons */}
          {deliveryStatus === 'idle' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-stretch gap-2">
                {assignmentItemId ? (
                  <button
                    onClick={openCamera}
                    disabled={isDelivering}
                    className="flex-1 h-11 text-sm font-bold rounded-xl bg-white text-gray-900 flex items-center justify-center gap-2 hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-50 shadow-md"
                  >
                    {isDelivering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {isDelivering ? 'Processing...' : 'Take Picture & Deliver'}
                  </button>
                ) : null}
                {onViewDetails && (
                  <button
                    onClick={() => onViewDetails()}
                    className={
                      assignmentItemId
                        ? "h-11 px-4 text-xs font-medium rounded-xl bg-white/15 text-white border border-white/20 hover:bg-white/25 flex items-center justify-center gap-1 cursor-pointer shrink-0 backdrop-blur-sm"
                        : "flex-1 h-11 text-sm font-bold rounded-xl bg-white text-gray-900 flex items-center justify-center gap-2 hover:bg-white/90 transition-colors cursor-pointer shadow-md"
                    }
                  >
                    {assignmentItemId ? (
                      <>Details <ChevronRight className="h-3.5 w-3.5" /></>
                    ) : (
                      <>View Details <ChevronRight className="h-4 w-4" /></>
                    )}
                  </button>
                )}
              </div>
              {isAdmin && !assignmentItemId && (
                <button
                  onClick={handleForceComplete}
                  disabled={forceCompleting}
                  className="w-full h-10 text-xs font-semibold rounded-xl bg-amber-500/70 text-white border border-amber-400/30 hover:bg-amber-500 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 backdrop-blur-sm transition-colors"
                >
                  {forceCompleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {forceCompleting ? 'Marking...' : 'Force Complete (admin)'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <input ref={inputRef} type="file" className="hidden" onChange={handleFile} />
    </div>
  )
}


