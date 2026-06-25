'use client'

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, Loader2, X, Image, MapPin, CheckCircle2, ChevronRight, ChevronLeft, Crosshair, Flag } from 'lucide-react'
import { useDeliverUnit } from '@/hooks/use-deliver-unit'
import { usePhotoQueue } from '@/hooks/use-photo-queue'
import { useFlaggedPsids } from '@/hooks/use-flagged-psids'
import { useSettings } from '@/hooks/use-settings'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingStore } from '@/stores/billing-store'
import { compressImage } from '@/lib/image/compress'
import { uploadToGAS } from '@/lib/drive-upload'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useUserLocation } from '@/hooks/use-user-location'
import { haversine } from '@/lib/geo'
import { useUdsTheme } from '@/hooks/use-uds-theme'
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
  const [deliveryGpsAccuracy, setDeliveryGpsAccuracy] = useState<number | null>(null)
  const [deliveryGpsLat, setDeliveryGpsLat] = useState<number | null>(null)
  const [deliveryGpsLng, setDeliveryGpsLng] = useState<number | null>(null)

  const [allowNoPhoto, setAllowNoPhoto] = useState(false)
  const [manualSync, setManualSync] = useState(false)
  const [showFlagDialog, setShowFlagDialog] = useState(false)
  const [flagDialogReason, setFlagDialogReason] = useState('unsent')
  const [flaggedReason, setFlaggedReason] = useState<string | null>(null)
  const [inputCooldown, setInputCooldown] = useState(false)
  const [processingStep, setProcessingStep] = useState<string | null>(null)
  const [selectedImageIdx, setSelectedImageIdx] = useState(0)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const touchXRef = useRef<number | null>(null)

  const queryClient = useQueryClient()
  const { mark } = useDeliverUnit()
  const { enqueuePhoto, queueCount } = usePhotoQueue()
  const { location: gpsLocation, isTracking: gpsIsTracking, error: gpsError } = useUserLocation()
  const { data: appSettings } = useSettings()

  useEffect(() => {
    if (!appSettings) return
    setAllowNoPhoto(appSettings?.allow_no_photo === true)
    setManualSync(appSettings?.unsent_mode?.enabled === true)
  }, [appSettings])

  const { data: flagData } = useFlaggedPsids(unit?.survey_id || null, unit?.psid || null)
  const isFlagged = !!flagData?.entries?.length

  const userId = useAuthStore((s) => s.user?.id)
  const userEmail = useAuthStore((s) => s.user?.email) || ''
  const roleName = useAuthStore((s) => s.roleName)
  const staffMode = useBillingStore((s) => s.staffMode)
  const isAdmin = roleName === 'admin' || roleName === 'super_admin'
  const { toast, updateToast } = useToast()
  const confirm = useConfirm()
  const { classes: t } = useUdsTheme()

  const deliveryLat = gpsLocation?.lat ?? initialLat ?? null
  const deliveryLng = gpsLocation?.lng ?? initialLng ?? null
  const gpsAccuracy = gpsLocation?.accuracy ?? null
  const liveDistance = useMemo(() => {
    if (!gpsLocation || !unit?.lat || !unit?.lng) return null
    return Math.round(haversine(gpsLocation.lat, gpsLocation.lng, unit.lat, unit.lng))
  }, [gpsLocation, unit?.lat, unit?.lng])
  const gpsThreshold = useMemo(() => {
    if (!appSettings?.gps_enforcement?.threshold) return 50
    return typeof appSettings.gps_enforcement.threshold === 'number' ? appSettings.gps_enforcement.threshold : 50
  }, [appSettings])
  const liveGpsStatus: 'idle' | 'locating' | 'ready' | 'unavailable' =
    !gpsLocation && !gpsError && !gpsIsTracking ? 'idle'
    : gpsIsTracking && !gpsLocation ? 'locating'
    : gpsError ? 'unavailable'
    : 'ready'

  const heroImages = useMemo(() => (unit?.image_urls)?.filter(Boolean) || [], [unit?.image_urls])
  const displayImage = heroImages[selectedImageIdx] || null
  const slides = heroImages.map((src) => ({ src }))

  useEffect(() => {
    setDeliveryStatus('idle')
    setIsDelivering(false)
    setProcessingStep(null)
    setDeliveryDistance(null)
    setDeliveryGpsLat(null)
    setDeliveryGpsLng(null)
    setSelectedImageIdx(0)
    setGalleryOpen(false)
    setFlaggedReason(null)
    setShowFlagDialog(false)
    setFlagDialogReason('unsent')
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

  // Keyboard + body scroll lock for gallery lightbox
  useEffect(() => {
    if (!galleryOpen) return
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGalleryOpen(false)
      if (e.key === 'ArrowLeft') setSelectedImageIdx((prev) => (prev - 1 + slides.length) % slides.length)
      if (e.key === 'ArrowRight') setSelectedImageIdx((prev) => (prev + 1) % slides.length)
    }
    window.addEventListener('keydown', handler)
    return () => {
      document.body.style.overflow = orig
      window.removeEventListener('keydown', handler)
    }
  }, [galleryOpen, slides.length])

  const openCamera = useCallback(() => {
    if (liveDistance != null && liveDistance > gpsThreshold) {
      setShowFlagDialog(true)
      return
    }
    if (!inputRef.current) return
    inputRef.current.accept = 'image/*'
    inputRef.current.capture = 'environment'
    inputRef.current.click()
  }, [liveDistance, gpsThreshold])

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
        gpsAccuracy,
      )

      if (!result) {
        updateToast(progressToastId, 'Network error — tap again to retry', 'error', 8000)
        setIsDelivering(false)
        return
      }

      setDeliveryStatus(result.status)
      setDeliveryDistance(result.distance)
      setDeliveryGpsAccuracy(result.gps_accuracy)
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
  }, [assignmentItemId, unit?.psid, unit?.survey_id, unit?.lat, unit?.lng, deliveryLat, deliveryLng, gpsAccuracy, userEmail, mark, enqueuePhoto, queueCount, manualSync, toast, updateToast, queryClient, userId])

  const handleNoPhotoMark = useCallback(async () => {
    if (!assignmentItemId || !unit?.psid) return

    setIsDelivering(true)
    try {
      const result = await mark(
        assignmentItemId,
        deliveryLat,
        deliveryLng,
        true,
        gpsAccuracy,
      )

      if (!result) {
        toast('Network error — tap again to retry', 'error', TOAST_DURATION)
        setIsDelivering(false)
        return
      }

      setDeliveryStatus(result.status)
      setDeliveryDistance(result.distance)
      setDeliveryGpsAccuracy(result.gps_accuracy)
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
      setIsDelivering(false)
    }
  }, [assignmentItemId, unit, deliveryLat, deliveryLng, gpsAccuracy, mark, toast, queryClient, userId])

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

  const handleFlagAndContinue = useCallback(async () => {
    if (!unit?.psid) return
    try {
      const res = await fetch('/api/admin/flagged-psids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          psid: unit.psid,
          survey_id: unit.survey_id || null,
          reason: flagDialogReason,
          notes: '',
        }),
      })
      if (res.ok) {
        setFlaggedReason(flagDialogReason)
        setShowFlagDialog(false)
        if (inputRef.current) {
          inputRef.current.accept = 'image/*'
          inputRef.current.capture = 'environment'
          inputRef.current.click()
        }
      } else {
        const j = await res.json().catch(() => ({}))
        toast(j.error || 'Failed to flag', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
  }, [unit?.psid, unit?.survey_id, flagDialogReason, toast])

  if (!unit) return null

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[1001] flex flex-col rounded-t-2xl overflow-hidden shadow-2xl bg-background max-h-[80vh] min-h-[300px] mx-auto w-full max-w-md"
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
      {/* Hero section */}
      <div className="relative flex-1 min-h-[300px]">
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none" />

        {/* Combined top strip: Close | GPS + dots | Gallery | Survey ID — flush with UDS edges */}
        <div className={`absolute top-0 left-0 right-0 z-20 ${t.stripBg} p-1.5 flex items-center gap-1.5`}>
          <button
            onClick={onClose}
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm cursor-pointer"
          >
            <X className="h-4 w-4 text-red-400" />
          </button>

          {/* GPS row — centered in available space */}
          {deliveryStatus === 'idle' && liveGpsStatus !== 'idle' && unit?.lat && unit?.lng && (
            <div className={cn(
              'flex-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold drop-shadow-sm',
              liveGpsStatus === 'locating' && t.gpsLocating,
              liveGpsStatus === 'unavailable' && t.gpsUnavailable,
              liveGpsStatus === 'ready' && liveDistance != null && liveDistance <= gpsThreshold && 'text-green-400',
              liveGpsStatus === 'ready' && liveDistance != null && liveDistance > gpsThreshold && liveDistance <= 100 && 'text-amber-400',
              liveGpsStatus === 'ready' && liveDistance != null && liveDistance > 100 && 'text-red-400',
            )}>
              {liveGpsStatus === 'ready' && gpsAccuracy != null && gpsAccuracy <= 50 && (
                <span className="mr-1">±{Math.round(gpsAccuracy)}m</span>
              )}
              <Crosshair className="h-3.5 w-3.5 shrink-0" />
              {liveGpsStatus === 'locating' && <span>Locating...</span>}
              {liveGpsStatus === 'unavailable' && <span>GPS unavailable</span>}
              {liveGpsStatus === 'ready' && liveDistance != null && (
                <span>
                  {liveDistance >= 1000 ? `${(liveDistance / 1000).toFixed(1)} km` : `${liveDistance} m`} away
                </span>
              )}
              {liveGpsStatus === 'ready' && gpsAccuracy != null && (
                <span className="flex items-center gap-1 ml-1">
                  {[10, 50, Infinity].map((threshold, i) => (
                    <span
                      key={i}
                      className={`h-2.5 w-2.5 rounded-full ${
                        gpsAccuracy <= threshold ? 'bg-green-400' : t.dotInactive
                      }`}
                    />
                  ))}
                </span>
              )}
            </div>
          )}

          {/* Gallery button with count */}
          {heroImages.length > 0 && (
            <button
              onClick={() => setGalleryOpen(true)}
              className="shrink-0 h-8 flex items-center gap-1.5 rounded-full bg-black/40 text-green-400 hover:bg-black/60 backdrop-blur-sm cursor-pointer transition-colors pl-1.5 pr-2.5"
              aria-label="Open gallery"
            >
              <Image className="h-4 w-4" />
              {heroImages.length > 1 && (
                <span className="text-[10px] font-bold leading-none">{heroImages.length}</span>
              )}
            </button>
          )}

          {/* Survey ID badge */}
          {unit.survey_id && (
            <span className="shrink-0 text-sm font-bold text-white font-mono mr-1">
              #{unit.survey_id}
            </span>
          )}
        </div>

        {/* Navigation arrows */}
        {onPrev && (
          <button
            onTouchEnd={(e) => { e.stopPropagation(); touchXRef.current = null }}
            onClick={(e) => { e.stopPropagation(); onPrev() }}
            className={`absolute left-0 top-1/2 -translate-y-1/2 z-20 h-12 w-10 flex items-center justify-center ${t.navArrowBg} ${t.navArrowText} hover:bg-black/20 hover:text-white/90 rounded-r-lg backdrop-blur-sm cursor-pointer transition-all`}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {onNext && (
          <button
            onTouchEnd={(e) => { e.stopPropagation(); touchXRef.current = null }}
            onClick={(e) => { e.stopPropagation(); onNext() }}
            className={`absolute right-0 top-1/2 -translate-y-1/2 z-20 h-12 w-10 flex items-center justify-center ${t.navArrowBg} ${t.navArrowText} hover:bg-black/20 hover:text-white/90 rounded-l-lg backdrop-blur-sm cursor-pointer transition-all`}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {/* House info — below top strip, text-shadow for readability against bright images */}
        <div className="absolute top-14 left-3 right-3 z-10">
          <p className={`text-base font-bold text-white truncate ${t.bodyTextShadow}`}>{unit.consumer_name || 'Unknown'}</p>
          {unit.address && (
            <p className={`text-xs ${t.bodyTextMuted} truncate mt-0.5 ${t.bodyTextShadow}`}>{unit.address}</p>
          )}
          {unit.uc_name && (
            <span className={`inline-flex items-center gap-1 text-[11px] ${t.bodyTextSubtle} mt-1 ${t.bodyTextShadow}`}>
              <MapPin className="h-3 w-3" /> {unit.uc_name}
            </span>
          )}
        </div>

        {/* Bottom content overlaid on hero */}
        <div className="absolute bottom-0 left-0 right-0 pt-1 pb-5 px-4 z-10 flex flex-col gap-2">
          {/* Action buttons + status hints */}
          {deliveryStatus === 'idle' && (
            <div className="flex flex-col gap-1.5">
              {/* Status hint — permanent reserved spot, no content shifting */}
              <div className="h-4 flex items-center justify-center">
                {itemStatus === 'delivered' && (
                  <span className={`text-[10px] ${t.bodyTextSubtle} text-center leading-none`}>Previously delivered — tap Redeliver to update photo</span>
                )}
                {itemStatus === 'processing' && (
                  <span className={`text-[10px] ${t.hintText} text-center leading-none`}>Needs attention — GPS was out of range</span>
                )}
              </div>

              {/* Single action row */}
              <div className="flex items-stretch gap-2">
                {/* Primary action */}
                {assignmentItemId && staffMode !== 'browse' ? (
                  allowNoPhoto ? (
                    <button
                      onClick={handleNoPhotoMark}
                      disabled={isDelivering || inputCooldown}
                      className="flex-1 h-11 text-sm font-bold rounded-xl bg-white text-gray-900 flex items-center justify-center gap-2 hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-50 shadow-md"
                    >
                      {(isDelivering || inputCooldown) ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-green-600" />}
                      {(isDelivering || inputCooldown) ? 'Processing...' : itemStatus === 'delivered' || itemStatus === 'processing' ? 'Redeliver' : 'Mark Delivery'}
                    </button>
                  ) : (
                    <button
                      onClick={openCamera}
                      disabled={isDelivering || inputCooldown}
                      className="flex-1 h-11 text-sm font-bold rounded-xl bg-white text-gray-900 flex items-center justify-center gap-2 hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-50 shadow-md"
                    >
                      {(isDelivering || inputCooldown) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      {(isDelivering || inputCooldown) ? 'Processing...' : itemStatus === 'delivered' || itemStatus === 'processing' ? 'Redeliver' : <>Take Picture<span className="hidden sm:inline"> & Deliver</span></>}
                    </button>
                  )
                ) : null}

                {/* Details button */}
                {onViewDetails && (
                  <button
                    onClick={() => onViewDetails()}
                    disabled={isDelivering || inputCooldown}
                    className={
                      assignmentItemId && staffMode !== 'browse'
                        ? `h-11 px-4 text-xs font-medium rounded-xl ${t.detailsBg} text-white border ${t.detailsBorder} hover:bg-white/25 flex items-center justify-center gap-1 cursor-pointer shrink-0 backdrop-blur-sm disabled:opacity-50`
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

                {/* Flag button — icon only */}
                {(assignmentItemId || isAdmin) && (
                  <button
                    onClick={handleFlag}
                    className={`h-11 w-11 flex items-center justify-center rounded-xl shrink-0 backdrop-blur-sm cursor-pointer transition-colors ${isFlagged || flaggedReason ? 'bg-red-500/80 text-white hover:bg-red-600' : `${t.flagBg} ${t.flagText} hover:bg-white/25 hover:text-white`}`}
                    title={isFlagged || flaggedReason ? `Flagged: ${flaggedReason || flagData?.entries?.[0]?.reason || 'Flagged'}` : 'Flag for review'}
                  >
                    <Flag className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Success overlay — inside hero so it covers everything */}
        {deliveryStatus !== 'idle' && (
          <div className={`absolute inset-0 z-30 flex items-center justify-center ${t.overlayBg} backdrop-blur-sm rounded-t-2xl`}>
            <div className="flex flex-col items-center gap-1.5 text-white">
              <div className={`h-14 w-14 rounded-full flex items-center justify-center backdrop-blur-sm ${deliveryStatus === 'processing' ? 'bg-amber-500/80' : 'bg-green-500/80'}`}>
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <span className="text-sm font-bold">{deliveryStatus === 'processing' ? 'Processing' : 'Delivered'}</span>
              {deliveryStatus === 'processing' && deliveryDistance == null && (
                <span className={`text-[10px] ${t.bodyTextMuted}`}>Saved — Awaiting GPS Verification</span>
              )}
              {deliveryStatus === 'processing' && deliveryDistance != null && (
                <span className={`text-[10px] ${t.bodyTextMuted}`}>Out of range — Awaiting Review</span>
              )}
              {deliveryDistance != null && (
                <span className={`text-[10px] ${t.bodyTextMuted}`}>
                  {deliveryDistance}m from target
                  {deliveryGpsAccuracy != null && `  ±${Math.round(deliveryGpsAccuracy)}m`}
                </span>
              )}
              {deliveryGpsLat != null && deliveryGpsLng != null && (
                <span className={`text-[10px] ${t.bodyTextSubtle} font-mono`}>
                  {deliveryGpsLat.toFixed(4)}, {deliveryGpsLng.toFixed(4)}
                </span>
              )}
              {processingStep && (
                <span className={`text-[10px] ${t.bodyTextMuted} mt-0.5`}>{processingStep}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* GPS OOR Flag Dialog */}
      {showFlagDialog && (
        <div
          className="fixed inset-0 z-[3000] bg-black/70 flex items-center justify-center p-4"
          onClick={() => setShowFlagDialog(false)}
        >
          <div className="bg-background rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">GPS Out of Range</h3>
            <p className="text-sm text-muted-foreground mb-4">
              You are <span className="font-semibold">{liveDistance}m</span> from the target (threshold: {gpsThreshold}m).
              Flag this unit and continue?
            </p>
            <label className="text-sm font-medium mb-1.5 block">Reason:</label>
            <Select
              value={flagDialogReason}
              onValueChange={(val) => setFlagDialogReason(val || 'unsent')}
            >
              <SelectTrigger className="w-full h-10 mb-4">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unsent">UnSent</SelectItem>
                <SelectItem value="duplicate_psid">Duplicate PSID</SelectItem>
                <SelectItem value="duplicate_sid">Duplicate S-ID</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFlagDialog(false)}
                className="flex-1 h-11 text-sm font-medium rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleFlagAndContinue}
                className="flex-1 h-11 text-sm font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition-colors cursor-pointer"
              >
                Flag & Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <input ref={inputRef} type="file" className="hidden" onChange={handleFile} />

      {/* Custom lightweight gallery lightbox */}
      {galleryOpen && (
        <div
          className="fixed inset-0 z-[2000] bg-black/95 flex items-center justify-center"
          onClick={() => setGalleryOpen(false)}
        >
          {/* Close button — large for mobile */}
          <button
            onClick={() => setGalleryOpen(false)}
            className="absolute top-4 right-4 z-10 h-10 w-10 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/40 active:bg-white/60 cursor-pointer transition-colors"
            aria-label="Close gallery"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Image */}
          <img
            src={slides[selectedImageIdx]?.src}
            alt=""
            className="max-w-full max-h-full object-contain px-4"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Prev/Next arrows */}
          {slides.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedImageIdx((prev) => (prev - 1 + slides.length) % slides.length)
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 h-12 w-12 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/40 active:bg-white/60 cursor-pointer transition-colors"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedImageIdx((prev) => (prev + 1) % slides.length)
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-12 w-12 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/40 active:bg-white/60 cursor-pointer transition-colors"
                aria-label="Next image"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
