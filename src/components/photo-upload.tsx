'use client'

import { useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Camera, Upload, Loader2 } from 'lucide-react'

interface PhotoUploadProps {
  surveyId: string
  onUploadComplete?: (url: string) => void
}

export function PhotoUpload({ surveyId, onUploadComplete }: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return

    setPreview(URL.createObjectURL(file))
    setUploading(true)

    try {
      const compressed = await compressImage(file, 1024, 0.8)
      const reader = new FileReader()
      reader.onloadend = async () => {
        try {
          const formData = new FormData()
          formData.append('image', reader.result as string)
          formData.append('filename', `${surveyId}_${Date.now()}.webp`)
          formData.append('surveyId', surveyId)

          const response = await fetch(process.env.NEXT_PUBLIC_DRIVE_WEBHOOK_URL || '/api/upload', {
            method: 'POST',
            body: formData,
          })

          if (response.ok) {
            const url = await response.text()
            onUploadComplete?.(url)
          }
        } catch (err) {
          console.error('Upload failed:', err)
        }
      }
      reader.readAsDataURL(compressed)
    } finally {
      setUploading(false)
    }
  }, [surveyId, onUploadComplete])

  const handleCapture = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.accept = 'image/*'
      inputRef.current.capture = 'environment'
      inputRef.current.click()
    }
  }, [])

  const handleSelect = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.accept = 'image/*'
      inputRef.current.capture = ''
      inputRef.current.click()
    }
  }, [])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleChange}
      />

      {preview && (
        <div className="relative rounded-lg overflow-hidden">
          <img src={preview} alt="Preview" className="w-full h-32 object-cover" />
          {uploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleCapture} disabled={uploading}>
          <Camera className="h-4 w-4 mr-1" /> Capture
        </Button>
        <Button variant="outline" size="sm" onClick={handleSelect} disabled={uploading}>
          <Upload className="h-4 w-4 mr-1" /> Upload
        </Button>
      </div>
    </div>
  )
}

function compressImage(file: File, maxWidth: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
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
