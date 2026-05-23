'use client'

import { useState, useMemo } from 'react'
import { X, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'

interface PhotoGalleryProps {
  imageUrls: string[] | null
}

export function PhotoGallery({ imageUrls }: PhotoGalleryProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  const urls = useMemo(() => (imageUrls || []).filter(Boolean), [imageUrls])

  if (!urls.length) {
    return (
      <div className="flex items-center justify-center h-24 bg-muted/50 rounded-lg">
        <div className="text-center">
          <ImageOff className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">No photos</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {urls.slice(0, 6).map((url, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedIdx(idx)}
            className="aspect-square rounded-lg overflow-hidden bg-muted"
          >
            <img
              src={url}
              alt={`Photo ${idx + 1}`}
              className="w-full h-full object-cover hover:scale-105 transition-transform"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {selectedIdx !== null && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
          <button
            onClick={() => setSelectedIdx(null)}
            className="absolute top-4 right-4 text-white"
          >
            <X className="h-6 w-6" />
          </button>

          {urls.length > 1 && (
            <>
              <button
                onClick={() => setSelectedIdx((prev) => Math.max(0, (prev || 0) - 1))}
                className="absolute left-4 text-white"
                disabled={selectedIdx === 0}
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button
                onClick={() => setSelectedIdx((prev) => Math.min(urls.length - 1, (prev || 0) + 1))}
                className="absolute right-4 text-white"
                disabled={selectedIdx === urls.length - 1}
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            </>
          )}

          <img
            src={urls[selectedIdx]}
            alt={`Photo ${selectedIdx + 1}`}
            className="max-w-full max-h-full object-contain p-4"
          />
        </div>
      )}
    </>
  )
}
