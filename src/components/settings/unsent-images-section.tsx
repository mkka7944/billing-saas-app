'use client'

import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Upload, ImageOff } from 'lucide-react'
import { usePhotoQueue } from '@/hooks/use-photo-queue'
import { useUnsyncedPhotos } from '@/hooks/use-unsynced-photos'
import { useToast } from '@/hooks/use-toast'

export function UnsentImagesSection() {
  const { queueCount, isProcessing, processQueue } = usePhotoQueue()
  const { count: dbUnsyncedCount } = useUnsyncedPhotos()
  const { toast } = useToast()

  const handleSyncAll = useCallback(async () => {
    await processQueue()
    toast('Sync completed', 'success')
  }, [processQueue, toast])

  if (queueCount === 0 && dbUnsyncedCount === 0) {
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
            {queueCount} photo{queueCount !== 1 ? 's' : ''} in queue
          </p>
          {dbUnsyncedCount > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {dbUnsyncedCount} pending in database
            </p>
          )}
        </div>
        <Button size="sm" onClick={handleSyncAll} disabled={isProcessing || queueCount === 0}>
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Upload className="h-4 w-4 mr-1" />
          )}
          Sync All
        </Button>
      </div>
    </div>
  )
}
