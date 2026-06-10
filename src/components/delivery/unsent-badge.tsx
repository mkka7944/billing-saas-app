'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePhotoQueue } from '@/hooks/use-photo-queue'
import { getAllQueued } from '@/lib/photo-queue'
import { Loader2, Upload, X, Image } from 'lucide-react'
import type { QueuedPhoto } from '@/lib/photo-queue'

interface UnsentModalProps {
  open: boolean
  onClose: () => void
}

export function UnsentModal({ open, onClose }: UnsentModalProps) {
  const { queueCount, isProcessing, processQueue, refreshCount, processingIndex, totalToProcess, currentFileSize, uploadSpeed } = usePhotoQueue()
  const [photos, setPhotos] = useState<QueuedPhoto[]>([])

  const loadPhotos = useCallback(async () => {
    const all = await getAllQueued()
    setPhotos(all)
    refreshCount()
  }, [refreshCount])

  useEffect(() => {
    if (open) loadPhotos()
  }, [open, loadPhotos])

  if (!open) return null

  const progressPct = totalToProcess > 0 ? Math.round(((processingIndex) / totalToProcess) * 100) : 0

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative bg-background rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm mx-0 sm:mx-4 p-5 shadow-xl border border-border animate-in slide-in-from-bottom-2 duration-200 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <h3 className="text-sm font-bold">Photo Queue</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isProcessing
                ? `Syncing ${processingIndex + 1}/${totalToProcess}`
                : `${queueCount} photo${queueCount !== 1 ? 's' : ''} waiting`
              }
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {photos.length > 0 && (
          <div className="flex-1 overflow-y-auto mb-4 space-y-1.5 -mx-1 px-1">
            {photos.map((p, i) => {
              const isCurrent = isProcessing && i === processingIndex
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-2.5 p-2 rounded-lg text-xs ${
                    isCurrent ? 'bg-amber-100 dark:bg-amber-900/20 ring-1 ring-amber-400' : 'bg-muted/50'
                  }`}
                >
                  {isCurrent ? (
                    <Loader2 className="h-3.5 w-3.5 text-amber-600 animate-spin shrink-0" />
                  ) : (
                    <Image className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="font-mono text-[10px] truncate flex-1">{p.psid}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {isCurrent && currentFileSize
                      ? currentFileSize
                      : p.retryCount > 0
                        ? `${p.retryCount}x retry`
                        : 'pending'
                    }
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {isProcessing && (
          <div className="mb-4 shrink-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>
                Syncing {processingIndex + 1}/{totalToProcess}
                {currentFileSize && ` \u00B7 ${currentFileSize}`}
                {uploadSpeed && ` \u00B7 ${uploadSpeed}`}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        <div className="flex gap-2 shrink-0">
          <button
            onClick={async () => { await processQueue(); loadPhotos() }}
            disabled={isProcessing || queueCount === 0}
            className="flex-1 h-9 text-xs font-bold rounded-xl bg-blue-500 text-white flex items-center justify-center gap-1.5 hover:bg-blue-600 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Sync All
          </button>
          <button
            onClick={onClose}
            className="h-9 px-4 text-xs font-medium rounded-xl bg-muted text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
