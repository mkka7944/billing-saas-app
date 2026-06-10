'use client'

import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Upload, ImageOff } from 'lucide-react'
import { usePhotoQueue } from '@/hooks/use-photo-queue'
import { useToast } from '@/hooks/use-toast'

export function UnsentImagesSection() {
  const { queueCount, isProcessing, processQueue, processingIndex, totalToProcess, currentFileSize, uploadSpeed } = usePhotoQueue()
  const { toast } = useToast()

  const handleSyncAll = useCallback(async () => {
    await processQueue()
    toast('Sync completed', 'success')
  }, [processQueue, toast])

  const progressPct = totalToProcess > 0 ? Math.round(((processingIndex) / totalToProcess) * 100) : 0

  if (queueCount === 0 && !isProcessing) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
          <ImageOff className="h-8 w-8" />
          <p className="text-sm font-medium">No pending photos</p>
          <p className="text-xs">All delivery photos are synced to Drive.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {isProcessing
              ? `Syncing ${processingIndex + 1}/${totalToProcess}${currentFileSize ? ` (${currentFileSize})` : ''}`
              : `${queueCount} photo${queueCount !== 1 ? 's' : ''} in queue`
            }
          </p>
          {isProcessing && uploadSpeed && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{uploadSpeed}</p>
          )}
        </div>
        <Button size="sm" onClick={handleSyncAll} disabled={isProcessing || queueCount === 0}>
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Upload className="h-4 w-4 mr-1" />
          )}
          {isProcessing ? 'Syncing...' : 'Sync All'}
        </Button>
      </div>
      {isProcessing && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
      )}
    </div>
  )
}
