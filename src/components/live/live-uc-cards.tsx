'use client'

import { useMemo, useState } from 'react'
import { useDeliveryTrail } from '@/hooks/use-delivery-trail'
import { useLiveStore } from '@/stores/live-store'
import { pktToday } from '@/lib/pkt'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface UCStat {
  uc_name: string
  delivered: number
  total: number
  rate: number
}

export function LiveUcCards({ onUcClick }: { onUcClick?: (ucName: string) => void }) {
  const selectedCity = useLiveStore((s) => s.selectedCity)
  const selectedDate = useLiveStore((s) => s.selectedDate)
  const { data } = useDeliveryTrail(selectedCity, selectedDate !== pktToday() ? selectedDate : null)
  const [expanded, setExpanded] = useState(false)

  const ucStats = useMemo(() => {
    const ucSummary = data?.ucSummary || []

    return ucSummary.map((u) => ({
      uc_name: u.uc_name,
      delivered: u.delivered,
      total: u.total_assigned,
      rate: u.rate,
    })).sort((a, b) => b.total - a.total)
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
          {ucStats.map((uc) => (
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
        </div>
      )}
    </div>
  )
}
