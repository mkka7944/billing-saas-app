'use client'

import { useMemo, useState } from 'react'
import { useDeliveryTrail } from '@/hooks/use-delivery-trail'
import { useLiveStore } from '@/stores/live-store'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface UCStat {
  uc_name: string
  delivered: number
  total: number
  rate: number
}

export function LiveUcCards({ onUcClick }: { onUcClick?: (ucName: string) => void }) {
  const selectedCity = useLiveStore((s) => s.selectedCity)
  const { data } = useDeliveryTrail(selectedCity)
  const [expanded, setExpanded] = useState(false)

  const ucStats = useMemo(() => {
    const markers = data?.markers || []
    const map = new Map<string, { delivered: number; missed: number; processing: number }>()

    for (const m of markers) {
      const uc = m.uc_name || 'Unknown'
      const stat = map.get(uc) || { delivered: 0, missed: 0, processing: 0 }
      if (m.status === 'delivered') stat.delivered++
      else if (m.status === 'missed') stat.missed++
      else stat.processing++
      map.set(uc, stat)
    }

    return Array.from(map.entries()).map(([uc_name, s]) => {
      const total = s.delivered + s.missed + s.processing
      return {
        uc_name,
        delivered: s.delivered,
        total,
        rate: total > 0 ? Math.round((s.delivered / total) * 100) : 0,
      }
    }).sort((a, b) => b.total - a.total)
  }, [data])

  if (!ucStats.length) return null

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground mb-1.5 hover:text-foreground transition-colors cursor-pointer"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        UC Cards ({ucStats.length})
      </button>
      {expanded && (
        <div className="space-y-1">
          {ucStats.slice(0, 10).map((uc) => (
            <div
              key={uc.uc_name}
              onClick={() => onUcClick?.(uc.uc_name)}
              className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-muted/40 text-xs cursor-pointer hover:bg-muted/60 transition-colors"
            >
              <span className="font-medium truncate flex-1">{uc.uc_name}</span>
              <span className="text-muted-foreground shrink-0 ml-2">{uc.delivered}/{uc.total}</span>
              <span className={`font-bold shrink-0 ml-2 w-8 text-right ${uc.rate >= 80 ? 'text-green-600' : uc.rate >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                {uc.rate}%
              </span>
            </div>
          ))}
          {ucStats.length > 10 && (
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              +{ucStats.length - 10} more
            </p>
          )}
        </div>
      )}
    </div>
  )
}
