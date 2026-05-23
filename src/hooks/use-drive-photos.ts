'use client'

import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'

const DRIVE_WEBHOOK_URL = process.env.NEXT_PUBLIC_DRIVE_WEBHOOK_URL || ''

export interface SyncStatus {
  uploading: boolean
  error: string | null
  photoUrl: string | null
}

export function useDrivePhotos() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ uploading: false, error: null, photoUrl: null })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const compressed = await compressImage(file)
      const base64 = await blobToBase64(compressed)

      const formData = new FormData()
      formData.append('image', base64)
      formData.append('filename', file.name.replace(/\.[^.]+$/, '.webp'))

      const response = await fetch(DRIVE_WEBHOOK_URL, { method: 'POST', body: formData })
      if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`)

      return response.text()
    },
    onSuccess: (photoUrl) => {
      setSyncStatus({ uploading: false, error: null, photoUrl })
    },
    onError: (err: Error) => {
      setSyncStatus({ uploading: false, error: err.message, photoUrl: null })
    },
  })

  const uploadPhoto = useCallback(async (file: File) => {
    setSyncStatus({ uploading: true, error: null, photoUrl: null })
    uploadMutation.mutate(file)
  }, [uploadMutation])

  return { uploadPhoto, syncStatus }
}

function compressImage(file: File, maxWidth = 1024, quality = 0.8): Promise<Blob> {
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
      if (!ctx) { reject(new Error('Could not get canvas context')); return }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Compression failed'))
      }, 'image/webp', quality)
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
