'use client'

import { useRef, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Camera, MapPin, CreditCard, RotateCw, Loader2 } from 'lucide-react'
import type { AssignmentItemWithUnit } from '@/types'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  delivered: 'Delivered',
  missed: 'Missed',
  skipped: 'Skipped',
}
const STATUS_BG: Record<string, string> = {
  pending: 'bg-blue-500',
  delivered: 'bg-green-500',
  missed: 'bg-red-500',
  skipped: 'bg-gray-400',
}
const STATUS_BORDER: Record<string, string> = {
  pending: 'border-l-blue-500',
  delivered: 'border-l-green-500',
  missed: 'border-l-red-500',
  skipped: 'border-l-gray-400',
}

interface DeliverCardListProps {
  items: AssignmentItemWithUnit[]
  selectedId: string | null
  onSelect: (id: string) => void
  photoPreviews?: Record<string, string>
  onRefresh?: () => Promise<unknown>
  isRefreshing?: boolean
}

const PULL_THRESHOLD = 80

export default function DeliverCardList({
  items,
  selectedId,
  onSelect,
  photoPreviews = {},
  onRefresh,
  isRefreshing,
}: DeliverCardListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [pullDist, setPullDist] = useState(0)
  const pullStart = useRef<number | null>(null)
  const isPulling = useRef(false)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!listRef.current || (listRef.current.scrollTop > 0)) return
    pullStart.current = e.touches[0].clientY
    isPulling.current = true
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || pullStart.current == null) return
    const delta = e.touches[0].clientY - pullStart.current
    if (delta > 0) {
      setPullDist(Math.min(delta * 0.5, PULL_THRESHOLD + 20))
    }
  }, [])

  const onTouchEnd = useCallback(() => {
    if (pullDist >= PULL_THRESHOLD && onRefresh) {
      onRefresh()
    }
    isPulling.current = false
    pullStart.current = null
    setPullDist(0)
  }, [pullDist, onRefresh])

  const sorted = [...items].sort((a, b) => (a.route_seq || 0) - (b.route_seq || 0))

  return (
    <div
      ref={listRef}
      className="absolute inset-0 overflow-y-auto overscroll-contain"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      <div
        className="flex items-center justify-center transition-all duration-200 overflow-hidden"
        style={{ height: pullDist }}
      >
        {pullDist >= PULL_THRESHOLD ? (
          <span className="text-[10px] text-muted-foreground font-medium">Release to refresh</span>
        ) : pullDist > 0 ? (
          <span className="text-[10px] text-muted-foreground">Pull to refresh</span>
        ) : null}
      </div>

      {isRefreshing && (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      <div className="px-3 pt-1 pb-4 space-y-2">
        {sorted.map((item) => {
          const isSelected = item.id === selectedId
          const preview = photoPreviews[item.id]
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(
                'w-full text-left rounded-xl border border-border bg-card hover:bg-accent/50 transition-colors cursor-pointer overflow-hidden',
                'border-l-4',
                STATUS_BORDER[item.status] || 'border-l-blue-500',
                isSelected && 'ring-2 ring-primary ring-offset-1'
              )}
            >
              <div className="p-3 flex gap-3">
                {/* Route sequence badge */}
                <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-xs font-bold text-muted-foreground">
                    {item.route_seq || '-'}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {item.unit?.consumer_name || 'Unknown'}
                      </p>
                      {item.unit?.address && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {item.unit.address}
                        </p>
                      )}
                    </div>
                    <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0', STATUS_BG[item.status] || 'bg-blue-500')}>
                      {STATUS_LABELS[item.status] || 'Pending'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                    {item.unit?.uc_name && (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" /> {item.unit.uc_name}
                      </span>
                    )}
                    {item.unit?.amount_due != null && (
                      <span className="flex items-center gap-0.5 font-semibold text-foreground">
                        <CreditCard className="h-3 w-3" /> Rs.{Number(item.unit.amount_due).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Photo thumbnail */}
                <div className="shrink-0">
                  {preview ? (
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted">
                      <img src={preview} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Camera className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
              </div>
            </button>
          )
        })}

        {items.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <p className="text-xs text-muted-foreground">No items in assignment</p>
          </div>
        )}
      </div>
    </div>
  )
}
