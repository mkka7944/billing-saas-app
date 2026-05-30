'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { MapPin, CreditCard, Camera, Loader2, X, Image } from 'lucide-react'
import { useDeliveryPhotos } from '@/hooks/use-delivery-photos'
import type { AssignmentItemWithUnit } from '@/types'

const SHEET_MIN = 64
const SHEET_MAX = 480
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  delivered: 'Delivered',
  missed: 'Missed',
  skipped: 'Skipped',
}
const STATUS_BG: Record<string, string> = {
  pending: 'bg-blue-500',
  delivered: 'bg-green-500',
  missed: 'bg-red-500',
  skipped: 'bg-gray-400',
}

interface DeliverBottomSheetProps {
  item: AssignmentItemWithUnit | null
  deliveredCount: number
  totalItems: number
  onPhotoCapture?: (dataUrl: string) => void
  photoPreview?: string | null
  isUploading?: boolean
  onMarkDelivered?: () => void
  onMarkMissed?: (reason: string) => void
  isMarking?: boolean
}

export default function DeliverBottomSheet({
  item,
  deliveredCount,
  totalItems,
  onPhotoCapture,
  photoPreview: externalPreview,
  isUploading,
  onMarkDelivered,
  onMarkMissed,
  isMarking,
}: DeliverBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [height, setHeight] = useState(SHEET_MIN)
  const dragStart = useRef<{ y: number; startHeight: number } | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [showMissedInput, setShowMissedInput] = useState(false)
  const [missedReason, setMissedReason] = useState('')

  const psid = item?.unit?.psid || null
  const { data: previousPhotos = [] } = useDeliveryPhotos(psid)

  const progressPct = totalItems > 0 ? Math.round((deliveredCount / totalItems) * 100) : 0
  const preview = externalPreview ?? localPreview
  const isDone = item?.status === 'delivered' || item?.status === 'missed'
  const hasPrevPhotos = previousPhotos.length > 0

  useEffect(() => {
    if (item) setHeight(320)
    else setHeight(SHEET_MIN)
  }, [item])

  useEffect(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setLocalPreview(null)
    setShowMissedInput(false)
    setMissedReason('')
  }, [item?.id])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragStart.current = { y: e.clientY, startHeight: height }
    const el = sheetRef.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
  }, [height])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return
    const delta = dragStart.current.y - e.clientY
    const newHeight = Math.max(SHEET_MIN, Math.min(SHEET_MAX, dragStart.current.startHeight + delta))
    setHeight(newHeight)
  }, [])

  const onPointerUp = useCallback(() => {
    dragStart.current = null
  }, [])

  const openCamera = useCallback(() => {
    if (!inputRef.current) return
    inputRef.current.accept = 'image/*'
    inputRef.current.capture = 'environment'
    inputRef.current.click()
  }, [])

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const previewUrl = URL.createObjectURL(file)
    previewUrlRef.current = previewUrl
    setLocalPreview(previewUrl)

    try {
      const compressed = await compressImage(file, 1024, 0.8)
      const reader = new FileReader()
      reader.onloadend = () => {
        const dataUrl = reader.result as string
        onPhotoCapture?.(dataUrl)
      }
      reader.readAsDataURL(compressed)
    } catch {
      // compression failed
    }
  }, [onPhotoCapture])

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setLocalPreview(null)
  }, [])

  const handleDeliver = useCallback(() => {
    setShowMissedInput(false)
    setMissedReason('')
    onMarkDelivered?.()
  }, [onMarkDelivered])

  const handleMissedTap = useCallback(() => {
    if (showMissedInput) {
      if (missedReason.trim()) {
        onMarkMissed?.(missedReason.trim())
        setShowMissedInput(false)
        setMissedReason('')
      }
      return
    }
    setShowMissedInput(true)
  }, [showMissedInput, missedReason, onMarkMissed])

  return (
    <div
      ref={sheetRef}
      className="fixed bottom-0 left-0 right-0 z-[1001] bg-background border-t border-border rounded-t-2xl shadow-2xl transition-[height] duration-200 ease-out"
      style={{ height, touchAction: 'none' }}
    >
      <div
        className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
      </div>

      <div className="px-4 pb-4 overflow-y-auto" style={{ height: 'calc(100% - 24px)' }}>
        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold">
              Delivered {deliveredCount}/{totalItems}
            </span>
            <span className="text-[10px] text-muted-foreground">{progressPct}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {item ? (
          <div className="space-y-2">
            {/* Name + status */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{item.unit?.consumer_name || 'Unknown'}</p>
                {item.unit?.address && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{item.unit.address}</p>
                )}
              </div>
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0', STATUS_BG[item.status] || 'bg-blue-500')}>
                {STATUS_LABELS[item.status] || 'Pending'}
              </span>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {item.unit?.uc_name && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {item.unit.uc_name}
                </span>
              )}
              {((item.unit?.monthly_fee ?? 0) + (item.unit?.arrears ?? 0)) > 0 && (
                <span className="flex items-center gap-1 font-semibold text-foreground">
                  <CreditCard className="h-3 w-3" /> Rs.{((item.unit?.monthly_fee ?? 0) + (item.unit?.arrears ?? 0)).toLocaleString()}
                </span>
              )}
              {item.unit?.monthly_fee != null && item.unit.monthly_fee > 0 && (
                <span className="text-muted-foreground">
                  {Number(item.unit.monthly_fee).toLocaleString()}/mo
                </span>
              )}
            </div>

            {/* Current photo preview */}
            {preview && (
              <div className="relative rounded-lg overflow-hidden bg-muted">
                <img src={preview} alt="Captured" className="w-full h-28 object-cover" />
                <button
                  onClick={clearPreview}
                  className="absolute top-1 right-1 h-6 w-6 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
                {isUploading && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                )}
              </div>
            )}

            {/* Previous Drive photos */}
            {hasPrevPhotos && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                  <Image className="h-3 w-3" /> Previous photos ({previousPhotos.length})
                </p>
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {previousPhotos.map((p) => (
                    <a
                      key={p.id}
                      href={p.photo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-muted border border-border hover:opacity-80 transition-opacity"
                    >
                      <img
                        src={p.photo_url}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ccc"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>'
                        }}
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            {!isDone && (
              <>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={openCamera}
                    disabled={isUploading || isMarking}
                    className="h-11 w-11 shrink-0 rounded-lg border border-border hover:bg-muted flex items-center justify-center cursor-pointer disabled:opacity-50"
                    title="Capture photo"
                  >
                    <Camera className={cn('h-4 w-4', isUploading && 'animate-pulse')} />
                  </button>

                  <button
                    onClick={handleDeliver}
                    disabled={isMarking}
                    className="flex-1 h-12 text-xs font-bold rounded-lg bg-green-600 text-white flex items-center justify-center gap-1.5 hover:bg-green-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isMarking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Mark Delivered
                  </button>
                  <button
                    onClick={handleMissedTap}
                    disabled={isMarking}
                    className="flex-1 h-12 text-xs font-bold rounded-lg bg-red-600 text-white flex items-center justify-center gap-1.5 hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isMarking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Missed
                  </button>
                </div>

                {showMissedInput && (
                  <div className="space-y-1.5">
                    <textarea
                      value={missedReason}
                      onChange={(e) => setMissedReason(e.target.value)}
                      placeholder="Enter reason for missed delivery..."
                      className="w-full h-20 rounded-lg border border-border bg-muted/30 p-2 text-xs resize-none outline-none focus:ring-1 focus:ring-ring"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowMissedInput(false)}
                        className="px-3 h-11 text-xs font-medium rounded-lg border border-border hover:bg-muted cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (missedReason.trim()) {
                            onMarkMissed?.(missedReason.trim())
                            setShowMissedInput(false)
                            setMissedReason('')
                          }
                        }}
                        disabled={!missedReason.trim()}
                        className="px-4 h-12 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer disabled:opacity-50"
                      >
                        Confirm Missed
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {isDone && item.delivered_at && (
              <p className="text-[10px] text-muted-foreground text-center pt-1">
                Marked as {item.status} at {new Date(item.delivered_at).toLocaleTimeString()}
              </p>
            )}

            <input ref={inputRef} type="file" className="hidden" onChange={handleFile} />
          </div>
        ) : (
          <div className="flex items-center justify-center py-4">
            <p className="text-xs text-muted-foreground">Tap a marker on the map to see details</p>
          </div>
        )}
      </div>
    </div>
  )
}

function compressImage(file: File, maxWidth: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img')
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('No canvas context')); return }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Compression failed'))
      }, 'image/webp', quality)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}
