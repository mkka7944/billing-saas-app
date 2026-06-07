'use client'

import { useEffect } from 'react'
import { usePhotoQueue } from '@/hooks/use-photo-queue'
import { Loader2, Upload, Image, X } from 'lucide-react'

interface UnsentModalProps {
  open: boolean
  onClose: () => void
}

export function UnsentModal({ open, onClose }: UnsentModalProps) {
  const { queueCount, isProcessing, lastError, processQueue, refreshCount } = usePhotoQueue()

  useEffect(() => {
    if (open) refreshCount()
  }, [open, refreshCount])

  const handleSyncAll = async () => {
    await processQueue()
    await refreshCount()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative bg-background rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm mx-0 sm:mx-4 p-5 shadow-xl border border-border animate-in slide-in-from-bottom-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold">Unsent Photos</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{queueCount} photo{queueCount !== 1 ? 's' : ''} queued</p>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isProcessing && (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Syncing...
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}

        {lastError && (
          <p className="text-[10px] text-red-500 mb-3">{lastError}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSyncAll}
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
