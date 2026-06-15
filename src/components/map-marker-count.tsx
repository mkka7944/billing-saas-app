'use client'

import { useMemo } from 'react'
import { useBillingStore } from '@/stores/billing-store'
import { shortenMCName } from '@/lib/mc-utils'
import { CITY_TEHSIL_MAP } from '@/lib/queries/hierarchy'

export function MapMarkerCount() {
  const filters = useBillingStore((s) => s.filters)
  const selectedCity = useBillingStore((s) => s.selectedCity)
  const queryDuration = useBillingStore((s) => s.queryDuration)
  const storeIsFetching = useBillingStore((s) => s.isFetching)
  const mapMarkers = useBillingStore((s) => s.mapMarkers)
  const showAll = filters.ucs.length > 0

  const count = mapMarkers.length

  const label = useMemo(() => {
    const parts: string[] = []
    if (filters.ucs.length > 0) {
      const cityCfg = selectedCity ? CITY_TEHSIL_MAP[selectedCity] : undefined
      const shortNames = filters.ucs.map((u) => shortenMCName(u, cityCfg?.district, cityCfg?.tehsil))
      if (filters.ucs.length <= 3) {
        parts.push(shortNames.join(', '))
      } else {
        parts.push(`${filters.ucs.length} UCs`)
      }
    } else if (filters.tehsils.length > 0) {
      parts.push(filters.tehsils.join(', '))
    } else if (filters.districts.length > 0) {
      parts.push(filters.districts.join(', '))
    } else {
      parts.push('All areas')
    }
    if (filters.paymentStatus !== 'all') {
      parts.push(filters.paymentStatus)
    }
    if (filters.search) {
      parts.push(`"${filters.search}"`)
    }
    return parts.join(' · ')
  }, [filters, selectedCity])

  if (!showAll) return null

  const durationText = storeIsFetching
    ? '...'
    : queryDuration != null
      ? `${(queryDuration / 1000).toFixed(1)}s`
      : null

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[700]">
      <div className="bg-black/60 text-white text-[11px] font-medium px-3 py-1.5 rounded-full backdrop-blur-sm shadow-lg whitespace-nowrap flex items-center gap-2 select-none">
        <span>{storeIsFetching ? '...' : `${count.toLocaleString()} markers`}</span>
        <span className="w-px h-3 bg-white/30" />
        <span className="truncate max-w-[140px] sm:max-w-[240px]">{label}</span>
        {durationText && (
          <>
            <span className="w-px h-3 bg-white/30" />
            <span className="tabular-nums">{durationText}</span>
          </>
        )}
      </div>
    </div>
  )
}
