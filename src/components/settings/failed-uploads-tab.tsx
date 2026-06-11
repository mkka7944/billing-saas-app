'use client'

import { useState, useEffect, useCallback } from 'react'
import { CameraOff, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface FailedPhoto {
  id: string
  assignment_item_id: string
  psid: string
  status: string
  staff_name: string
  staff_id: string | null
  gps_lat: number | null
  gps_lng: number | null
  captured_at: string
}

export function FailedUploadsTab() {
  const [photos, setPhotos] = useState<FailedPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [staffFilter, setStaffFilter] = useState('')
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([])
  const { toast } = useToast()

  const fetchFailed = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (staffFilter) params.set('staff_id', staffFilter)

      const res = await fetch(`/api/deliveries/failed-uploads?${params}`)
      const json = await res.json()
      if (json.photos) setPhotos(json.photos)
      if (json.staffList) setStaffList(json.staffList)
    } catch {
      toast('Failed to load failed uploads', 'error')
    } finally {
      setLoading(false)
    }
  }, [staffFilter, toast])

  useEffect(() => {
    fetchFailed()
  }, [fetchFailed])

  const handleVerify = async (photoId: string) => {
    setVerifying(photoId)
    try {
      const res = await fetch('/api/deliveries/verify-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId }),
      })
      if (res.ok) {
        setPhotos(prev => prev.filter(p => p.id !== photoId))
        toast('Delivery verified', 'success')
      } else {
        const j = await res.json()
        toast(j.error || 'Failed to verify', 'error')
      }
    } catch {
      toast('Network error', 'error')
    } finally {
      setVerifying(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-1.5">
                <CameraOff className="h-4 w-4 text-amber-500" />
                Failed Uploads
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Deliveries where the photo never synced to Google Drive.
                Staff GPS coordinates are available for verification.
              </CardDescription>
            </div>
            <button
              onClick={fetchFailed}
              disabled={loading}
              className="h-7 px-2.5 text-[11px] font-medium rounded-lg bg-muted hover:bg-accent flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </CardHeader>
      </Card>

      {staffList.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setStaffFilter('')}
            className={cn(
              'shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors cursor-pointer border',
              !staffFilter ? 'bg-muted/50 text-foreground border-border' : 'text-muted-foreground border-transparent hover:bg-muted'
            )}
          >
            All Staff
          </button>
          {staffList.map(s => (
            <button
              key={s.id}
              onClick={() => setStaffFilter(staffFilter === s.id ? '' : s.id)}
              className={cn(
                'shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors cursor-pointer border',
                staffFilter === s.id ? 'bg-blue-500/10 text-blue-600 border-blue-200' : 'text-muted-foreground border-transparent hover:bg-muted'
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading...
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-1">
              <CameraOff className="h-6 w-6" />
              <p className="text-sm font-medium">All clear</p>
              <p className="text-xs">No unverified failed uploads.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {photos.map(photo => (
                <div key={photo.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{photo.psid}</span>
                      {photo.status === 'processing' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-semibold">
                          GPS out of range
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{photo.staff_name}</span>
                      <span>&middot;</span>
                      <span>{new Date(photo.captured_at).toLocaleDateString()}</span>
                    </div>
                    {photo.gps_lat != null && photo.gps_lng != null && (
                      <p className="text-[10px] text-muted-foreground font-mono">
                        GPS: {photo.gps_lat.toFixed(5)}, {photo.gps_lng.toFixed(5)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleVerify(photo.id)}
                    disabled={verifying === photo.id}
                    className="shrink-0 h-7 px-2.5 text-[11px] font-semibold rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-200 flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    {verifying === photo.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    Verify
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
