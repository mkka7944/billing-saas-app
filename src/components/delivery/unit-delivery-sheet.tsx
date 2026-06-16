'use client'

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, Loader2, X, Image, MapPin, CheckCircle2, ChevronRight, ChevronLeft, Crosshair } from 'lucide-react'
import { useDeliveryPhotos } from '@/hooks/use-delivery-photos'
import { useDeliverUnit } from '@/hooks/use-deliver-unit'
import { usePhotoQueue } from '@/hooks/use-photo-queue'
import { useSettings } from '@/hooks/use-settings'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingStore } from '@/stores/billing-store'
import { compressImage } from '@/lib/image/compress'
import { uploadToGAS } from '@/lib/drive-upload'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { useUserLocation } from '@/hooks/use-user-location'
import { haversine } from '@/lib/geo'
import type { AssignmentItemUnit, AssignmentItemWithUnit } from '@/types'

const TOAST_DURATION = 12000

interface UnitDeliverySheetProps {
  unit: AssignmentItemUnit | null
  assignmentItemId: string | null
  initialLat?: number | null
  initialLng?: number | null
  itemStatus?: string | null
  onViewDetails?: () => void
  onPrev?: () => void
  onNext?: () => void
  onClose?: () => void
}

export default function UnitDeliverySheet({
  unit,
  assignmentItemId,
  initialLat,
  initialLng,
  itemStatus,
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
  const [forceCompleting, setForceCompleting] = useState(false)
  const [allowNoPhoto, setAllowNoPhoto] = useState(false)
  const [manualSync, setManualSync] = useState(false)
  const [inputCooldown, setInputCooldown] = useState(false)
  const [processingStep, setProcessingStep] = useState<string | null>(null)
  const touchXRef = useRef<number | null>(null)

  const queryClient = useQueryClient()
  const { data: previousPhotos = [] } = useDeliveryPhotos(unit?.psid || null)
  const { mark } = useDeliverUnit()
  const { enqueuePhoto, queueCount } = usePhotoQueue()
  const { location: gpsLocation, isTracking: gpsIsTracking, error: gpsError } = useUserLocation()
  const { data: appSettings } = useSettings()

  useEffect(() => {
    if (!appSettings) return
    setAllowNoPhoto(appSettings?.allow_no_photo === true)
    setManualSync(appSettings?.unsent_mode?.enabled === true)
  }, [appSettings])

  const userId = useAuthStore((s) => s.user?.id)
  const userEmail = useAuthStore((s) => s.user?.email) || ''
  const roleName = useAuthStore((s) => s.roleName)
  const staffMode = useBillingStore((s) => s.staffMode)
  const isAdmin = roleName === 'admin' || roleName === 'super_admin'
  const { toast, updateToast } = useToast()
  const confirm = useConfirm()

  const deliveryLat = gpsLocation?.lat ?? initialLat ?? null
  const deliveryLng = gpsLocation?.lng ?? initialLng ?? null
  const gpsAccuracy = gpsLocation?.accuracy ?? null
  const liveDistance = useMemo(() => {
    if (!gpsLocation || !unit?.lat || !unit?.lng) return null
    return Math.round(haversine(gpsLocation.lat, gpsLocation.lng, unit.lat, unit.lng))
  }, [gpsLocation, unit?.lat, unit?.lng])
  const liveGpsStatus: 'idle' | 'locating' | 'ready' | 'unavailable' =
    !gpsLocation && !gpsError && !gpsIsTracking ? 'idle'
    : gpsIsTracking && !gpsLocation ? 'locating'
    : gpsError ? 'unavailable'
    : 'ready'

  useEffect(() => {
    setDeliveryStatus('idle')
    setIsDelivering(false)
    setProcessingStep(null)
    setDeliveryDistance(null)
    setDeliveryGpsLat(null)
    setDeliveryGpsLng(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit?.psid])

  // Cooldown on unit change — prevents accidental taps during transition
  useEffect(() => {
    setInputCooldown(true)
    const timer = setTimeout(() => setInputCooldown(false), 2000)
    return () => clearTimeout(timer)
  }, [unit?.psid])



  // Auto-advance after successful delivery
  useEffect(() => {
    if (deliveryStatus === 'delivered' || deliveryStatus === 'processing') {
      const delay = deliveryStatus === 'delivered' ? 2000 : 3500
      const timer = setTimeout(() => {
        setIsDelivering(false)
        onNext?.()
      }, delay)
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

    if (queueCount >= 50) {
      toast(`Queue full (${queueCount}/50)`, 'warning', TOAST_DURATION)
      return
    }

    setIsDelivering(true)
    const progressToastId = toast('Saving delivery...', 'info', 30000)
    setProcessingStep('Saving...')

    try {
      // Step 1: Mark delivery (creates placeholder + GPS check)
      const result = await mark(
        assignmentItemId,
        deliveryLat,
        deliveryLng,
        false,
      )

      if (!result) {
        updateToast(progressToastId, 'Network error — tap again to retry', 'error', 8000)
        setIsDelivering(false)
        return
      }

      setDeliveryStatus(result.status)
      setDeliveryDistance(result.distance)
      setDeliveryGpsLat(result.gps_lat)
      setDeliveryGpsLng(result.gps_lng)
      setProcessingStep('Delivery saved')

      // Optimistic cache update
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
      queryClient.invalidateQueries({ queryKey: ['delivery-photos'] })

      // Step 2: Handle photo upload
      if (result.delivery_photo_id) {
        const compressed = await compressImage(file)

        if (!manualSync && navigator.onLine && unit?.survey_id) {
          // Direct upload to Google Drive
          setProcessingStep('Uploading photo...')
          updateToast(progressToastId, 'Uploading photo...', 'info', 30000)

          const sizeKB = Math.round(compressed.size / 1024)
          const sizeLabel = sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`

          try {
            updateToast(progressToastId, `Uploading (${sizeLabel})...`, 'info', 30000)
            const gdriveFileId = await uploadToGAS(compressed, unit.survey_id, userEmail)
            setProcessingStep('Syncing to Drive...')
            updateToast(progressToastId, 'Photo uploaded! Finalizing...', 'info', 30000)
            await fetch('/api/deliveries/sync-photo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                deliveryPhotoId: result.delivery_photo_id,
                gdriveFileId,
              }),
            })
            updateToast(
              progressToastId,
              result.status === 'delivered'
                ? `Delivered${result.distance != null ? ` (${result.distance}m away)` : ''}`
                : 'GPS out of range — sent for review',
              result.status === 'delivered' ? 'success' : 'warning',
              TOAST_DURATION,
            )
          } catch {
            setProcessingStep('Photo queued for sync')
            updateToast(progressToastId, 'Queued — upload failed', 'warning', TOAST_DURATION)
            await enqueuePhoto({
              deliveryPhotoId: result.delivery_photo_id,
              assignmentItemId,
              psid: unit.psid,
              surveyId: unit.survey_id,
              email: userEmail,
              photoBlob: compressed,
              gpsLat: deliveryLat,
              gpsLng: deliveryLng,
              skipAutoSync: false,
            })
          }
        } else {
          setProcessingStep('Photo queued for sync')
          updateToast(
            progressToastId,
            manualSync
              ? 'Queued — tap Sync'
              : 'Queued',
            'info',
            TOAST_DURATION,
          )
          await enqueuePhoto({
            deliveryPhotoId: result.delivery_photo_id,
            assignmentItemId,
            psid: unit.psid,
            surveyId: unit.survey_id || '',
            email: userEmail,
            photoBlob: compressed,
            gpsLat: deliveryLat,
            gpsLng: deliveryLng,
            skipAutoSync: manualSync,
          })
        }

        if (queueCount + 1 >= 50) {
          toast(`Nearly full — tap Sync`, 'info', TOAST_DURATION)
        }
      }
    } catch (e) {
      updateToast(progressToastId, e instanceof Error ? e.message : 'Server error', 'error', TOAST_DURATION)
      setIsDelivering(false)
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }, [assignmentItemId, unit?.psid, unit?.survey_id, unit?.lat, unit?.lng, deliveryLat, deliveryLng, userEmail, mark, enqueuePhoto, queueCount, manualSync, toast, updateToast, queryClient, userId])

  const handleSkipPhoto = useCallback(async () => {
    if (!assignmentItemId || !unit?.psid) return
    const ok = await confirm({
      title: 'Deliver without photo?',
      message: 'GPS coordinates and timestamp will be recorded. No photo will be saved.',
      confirmLabel: 'Deliver without Photo',
      variant: 'default',
    })
    if (!ok) return

    setIsDelivering(true)
    try {
      const result = await mark(
        assignmentItemId,
        deliveryLat,
        deliveryLng,
        true,
      )

      if (!result) {
        toast('Network error — tap again to retry', 'error', TOAST_DURATION)
        setIsDelivering(false)
        return
      }

      setDeliveryStatus(result.status)
      setDeliveryDistance(result.distance)
      setDeliveryGpsLat(result.gps_lat)
      setDeliveryGpsLng(result.gps_lng)

      toast(
        result.status === 'delivered'
          ? `Delivered${result.distance != null ? ` (${result.distance}m away)` : ''}`
          : 'GPS out of range — sent for review',
        result.status === 'delivered' ? 'success' : 'warning',
        TOAST_DURATION,
      )

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
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Server error', 'error', TOAST_DURATION)
      setIsDelivering(false)  // reset on error
    } finally {
      // isDelivering stays true on success — auto-advance timer handles it
    }
  }, [assignmentItemId, unit, deliveryLat, deliveryLng, mark, confirm, toast, queryClient, userId])

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

  const handleFlag = useCallback(async () => {
    const ok = await confirm({
      title: 'Flag for Review',
      message: `Mark PSID ${unit?.psid} as needing review? An admin will check this later.`,
      confirmLabel: 'Flag',
      variant: 'default',
    })
    if (!ok || !unit?.psid) return
    try {
      const res = await fetch('/api/admin/flagged-psids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          psid: unit.psid,
          survey_id: unit.survey_id || null,
          reason: 'staff_flagged',
          notes: '',
        }),
      })
      if (res.ok) {
        toast('Flagged for review', 'success')
      } else {
        const j = await res.json().catch(() => ({}))
        toast(j.error || 'Failed to flag', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
  }, [unit?.psid, unit?.survey_id, confirm, toast])

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
              {processingStep && (
                <span className="text-[10px] text-white/70 mt-0.5">{processingStep}</span>
              )}
              {isAdmin && deliveryStatus === 'processing' && (
                <button
                  onClick={handleForceComplete}
                  disabled={forceCompleting}
                  className="mt-2 w-full h-8 text-[11px] font-semibold rounded-lg bg-amber-500/70 text-white border border-amber-400/30 hover:bg-amber-500 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 backdrop-blur-sm transition-colors"
                >
                  {forceCompleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {forceCompleting ? 'Marking...' : 'Force Complete (admin)'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Bottom content — info + actions on the image */}
        <div className="absolute bottom-0 left-0 right-0 p-4 pb-6 z-10 flex flex-col gap-3">
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
              {liveGpsStatus === 'ready' && gpsAccuracy != null && (
                <span className="flex items-center gap-0.5 ml-auto">
                  {[10, 50, Infinity].map((threshold, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full ${
                        gpsAccuracy <= threshold ? 'text-green-400 bg-green-400' : 'bg-white/20'
                      }`}
                    />
                  ))}
                </span>
              )}
            </div>
          )}

          {/* Action buttons */}
          {deliveryStatus === 'idle' && (
            <div className="flex flex-col gap-2">
              {itemStatus === 'delivered' && (
                <span className="text-[10px] text-white/50 text-center">Previously delivered — tap Redeliver to update photo</span>
              )}
              {itemStatus === 'processing' && (
                <span className="text-[10px] text-amber-300/70 text-center">Needs attention — GPS was out of range</span>
              )}
              <div className="flex items-stretch gap-2">
                {assignmentItemId && staffMode !== 'browse' ? (
                  <button
                    onClick={openCamera}
                    disabled={isDelivering || inputCooldown}
                    className="flex-1 h-11 text-sm font-bold rounded-xl bg-white text-gray-900 flex items-center justify-center gap-2 hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-50 shadow-md"
                  >
                    {(isDelivering || inputCooldown) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {(isDelivering || inputCooldown) ? 'Processing...' : itemStatus === 'delivered' || itemStatus === 'processing' ? 'Redeliver' : 'Take Picture & Deliver'}
                  </button>
                ) : null}
                {onViewDetails && (
                  <button
                    onClick={() => onViewDetails()}
                    disabled={isDelivering || inputCooldown}
                    className={
                      assignmentItemId && staffMode !== 'browse'
                        ? "h-11 px-4 text-xs font-medium rounded-xl bg-white/15 text-white border border-white/20 hover:bg-white/25 flex items-center justify-center gap-1 cursor-pointer shrink-0 backdrop-blur-sm disabled:opacity-50"
                        : "flex-1 h-11 text-sm font-bold rounded-xl bg-white text-gray-900 flex items-center justify-center gap-2 hover:bg-white/90 transition-colors cursor-pointer shadow-md disabled:opacity-50"
                    }
                  >
                {assignmentItemId && staffMode !== 'browse' ? (
                      <>Details <ChevronRight className="h-3.5 w-3.5" /></>
                    ) : (
                      <>View Details <ChevronRight className="h-4 w-4" /></>
                    )}
                  </button>
                )}
              </div>
              {allowNoPhoto && assignmentItemId && staffMode !== 'browse' && (
                <button
                  onClick={handleSkipPhoto}
                  disabled={isDelivering || inputCooldown}
                  className='w-full h-9 text-[11px] font-medium rounded-lg bg-white/10 text-white/70 border border-white/10 hover:bg-white/20 hover:text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 backdrop-blur-sm transition-colors'
                >
                  {(isDelivering || inputCooldown) ? <Loader2 className='h-3 w-3 animate-spin' /> : <Crosshair className='h-3 w-3' />}
                  {(isDelivering || inputCooldown) ? 'Processing...' : 'Photo not working? Tap to deliver without photo'}
                </button>
              )}
              {deliveryStatus === 'idle' && assignmentItemId && (
                <button
                  onClick={handleFlag}
                  className='w-full h-8 text-[10px] font-medium text-white/40 hover:text-white/70 flex items-center justify-center gap-1 cursor-pointer transition-colors'
                >
                  Flag for Review
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


