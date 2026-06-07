'use client'

import { useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, Trash2, Upload, ImageOff } from 'lucide-react'
import { useUnsentPhotos } from '@/hooks/use-unsent-photos'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useToast } from '@/hooks/use-toast'

function getPhotoUrl(photo: { dataUrl?: string; photoBlob?: Blob }): string {
  if (photo.dataUrl) return photo.dataUrl
  if (photo.photoBlob) return URL.createObjectURL(photo.photoBlob)
  return ''
}

export function UnsentImagesSection() {
  const { unsentList, count, syncingIds, retrySingle, retryAll, discard, refresh } = useUnsentPhotos()
  const confirm = useConfirm()
  const { toast } = useToast()
  const blobUrlsRef = useRef<string[]>([])

  useEffect(() => {
    const urls = unsentList.map((p) => (p.photoBlob ? URL.createObjectURL(p.photoBlob) : ''))
    blobUrlsRef.current = urls
    return () => {
      for (const url of urls) {
        if (url) URL.revokeObjectURL(url)
      }
    }
  }, [unsentList])

  const handleRetryAll = useCallback(async () => {
    await retryAll()
    toast('Sync completed', 'success')
    refresh()
  }, [retryAll, toast, refresh])

  const handleRetryOne = useCallback(async (photo: Parameters<typeof retrySingle>[0]) => {
    const ok = await retrySingle(photo)
    if (ok) {
      toast(`PSID ${photo.psid} synced`, 'success')
    } else {
      toast(`PSID ${photo.psid} failed`, 'error')
    }
  }, [retrySingle, toast])

  const handleDiscard = useCallback(async (id: number, psid: string) => {
    const ok = await confirm({
      title: 'Discard Photo',
      message: `Remove unsent photo for PSID ${psid}? This cannot be undone.`,
      confirmLabel: 'Discard',
      variant: 'destructive',
    })
    if (!ok) return
    await discard(id)
    toast('Photo discarded', 'info')
  }, [discard, confirm, toast])

  if (count === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
          <ImageOff className="h-8 w-8" />
          <p className="text-sm font-medium">No unsent images</p>
          <p className="text-xs">Photos that failed to sync to Drive will appear here.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{count} unsent image{count !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={handleRetryAll} disabled={syncingIds.size > 0}>
          {syncingIds.size > 0 ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Upload className="h-4 w-4 mr-1" />
          )}
          Sync All
        </Button>
      </div>

      <div className="space-y-2">
        {unsentList.map((photo) => {
          const isSyncing = syncingIds.has(photo.id!)
          const thumbSrc = getPhotoUrl(photo)
          return (
            <Card key={photo.id}>
              <CardContent className="flex items-start gap-3 p-3">
                <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-muted">
                  {thumbSrc ? (
                    <img
                      src={thumbSrc}
                      alt={`PSID ${photo.psid}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px]">
                      No img
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">PSID {photo.psid}</span>
                    {photo.retryCount > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        Retry {photo.retryCount}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(photo.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRetryOne(photo)}
                    disabled={isSyncing}
                    className="h-8 w-8 p-0"
                  >
                    {isSyncing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDiscard(photo.id!, photo.psid)}
                    disabled={isSyncing}
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
