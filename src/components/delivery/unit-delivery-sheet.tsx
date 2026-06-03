'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { Camera, Loader2, X, Image, MapPin, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react'
import { useDeliveryPhotos } from '@/hooks/use-delivery-photos'
import type { AssignmentItemUnit } from '@/types'

interface UnitDeliverySheetProps {
  unit: AssignmentItemUnit | null
  assignmentItemId: string | null
  isMarking?: boolean
  onDeliver?: (itemId: string, dataUrl: string) => void
  onViewDetails?: () => void
  onPrev?: () => void
  onNext?: () => void
  onClose?: () => void
}

export default function UnitDeliverySheet({
  unit,
  assignmentItemId,
  isMarking,
  onDeliver,
  onViewDetails,
  onPrev,
  onNext,
  onClose,
}: UnitDeliverySheetProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [delivering, setDelivering] = useState(false)
  const photoUrlRef = useRef<string | null>(null)
  const [delivered, setDelivered] = useState(false)
  const touchXRef = useRef<number | null>(null)

  const { data: previousPhotos = [] } = useDeliveryPhotos(unit?.psid || null)

  useEffect(() => {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
    photoUrlRef.current = null
    setPhoto(null)
    setPhotoFile(null)
    setDelivering(false)
    setDelivered(false)
  }, [unit?.psid])

  const openCamera = useCallback(() => {
    if (!inputRef.current) return
    inputRef.current.accept = 'image/*'
    inputRef.current.capture = 'environment'
    inputRef.current.click()
  }, [])

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return

    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
    const previewUrl = URL.createObjectURL(file)
    photoUrlRef.current = previewUrl
    setPhoto(previewUrl)
    setPhotoFile(file)
  }, [])

  const handleDeliver = useCallback(async () => {
    if (!photoFile || !assignmentItemId || delivering) return

    setDelivering(true)
    try {
      const compressed = await compressImage(photoFile, 1024, 0.8)
      const reader = new FileReader()
      reader.onloadend = () => {
        const dataUrl = reader.result as string
        onDeliver?.(assignmentItemId, dataUrl)
        setDelivered(true)
      }
      reader.readAsDataURL(compressed)
    } catch {
      setDelivering(false)
    }
  }, [photoFile, assignmentItemId, delivering, onDeliver])

  if (!unit || !assignmentItemId) return null

  const hasPortalImage = (unit.image_urls?.length ?? 0) > 0
  const totalDue = (unit.monthly_fee ?? 0) + (unit.arrears ?? 0)
  const displayImage = photo || unit.image_urls?.[0] || null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[1001] flex flex-col rounded-t-2xl overflow-hidden shadow-2xl bg-background max-h-[80vh] lg:left-1/2 lg:-translate-x-1/2 lg:max-w-md lg:right-auto">
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

        {/* Previous photos badge */}
        {!photo && !delivered && previousPhotos.length > 0 && (
          <div className="absolute top-3 right-3 bg-black/50 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-sm z-10">
            <Image className="h-3 w-3" /> {previousPhotos.length}
          </div>
        )}

        {/* Photo preview dismiss button */}
        {photo && (
          <button
            onClick={() => { setPhoto(null); setPhotoFile(null) }}
            className="absolute top-3 right-3 z-10 h-7 w-7 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
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
        {delivered && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="flex flex-col items-center gap-1.5 text-white">
              <div className="h-14 w-14 rounded-full bg-green-500/80 flex items-center justify-center backdrop-blur-sm">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <span className="text-sm font-bold">Delivered</span>
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

          {/* Action buttons */}
          {!delivered && (
            <div className="flex items-stretch gap-2">
              {!photo ? (
                <button
                  onClick={openCamera}
                  disabled={isMarking}
                  className="flex-1 h-11 text-sm font-bold rounded-xl bg-white text-gray-900 flex items-center justify-center gap-2 hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-50 shadow-md"
                >
                  <Camera className="h-4 w-4" />
                  Take Picture & Deliver
                </button>
              ) : (
                <button
                  onClick={handleDeliver}
                  disabled={delivering}
                  className="flex-1 h-11 text-sm font-bold rounded-xl bg-green-500 text-white flex items-center justify-center gap-2 hover:bg-green-600 transition-colors cursor-pointer disabled:opacity-50 shadow-md"
                >
                  {delivering ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Confirm Delivery
                </button>
              )}
              {onViewDetails && (
                <button
                  onClick={() => onViewDetails()}
                  className="h-11 px-4 text-xs font-medium rounded-xl bg-white/15 text-white border border-white/20 hover:bg-white/25 flex items-center justify-center gap-1 cursor-pointer shrink-0 backdrop-blur-sm"
                >
                  Details <ChevronRight className="h-3.5 w-3.5" />
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
