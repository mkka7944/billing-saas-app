'use client'

import { useMemo } from 'react'
import { useIsFetching } from '@tanstack/react-query'
import { useBillingStore } from '@/stores/billing-store'
import { useAuthStore } from '@/stores/auth-store'
import { shortenMCName } from '@/lib/mc-utils'
import { CITY_TEHSIL_MAP } from '@/lib/queries/hierarchy'

export function MapMarkerCount({ staffCount }: { staffCount?: number }) {
  const filters = useBillingStore((s) => s.filters)
  const selectedCity = useBillingStore((s) => s.selectedCity)
  const queryDuration = useBillingStore((s) => s.queryDuration)
  const storeIsFetching = useIsFetching() > 0
  const mapMarkers = useBillingStore((s) => s.mapMarkers)
  const staffMode = useBillingStore((s) => s.staffMode)
  const roleName = useAuthStore((s) => s.roleName)
  const isAdmin = roleName === 'admin' || roleName === 'super_admin'
  const showAll = filters.ucs.length > 0

  const count = staffCount != null ? staffCount : mapMarkers.length

  const filterLabel = useMemo(() => {
    if (showAll) {
      const cityCfg = selectedCity ? CITY_TEHSIL_MAP[selectedCity] : undefined
      const shortNames = filters.ucs.map((u) => shortenMCName(u, cityCfg?.district, cityCfg?.tehsil))
      if (filters.ucs.length <= 3) {
        return shortNames.join(', ')
      }
      return `${filters.ucs.length} UCs`
    }
    if (filters.tehsils.length > 0) return filters.tehsils.join(', ')
    if (filters.districts.length > 0) return filters.districts.join(', ')
    return 'All areas'
  }, [filters, selectedCity, showAll])

  const paymentLabel = filters.paymentStatus !== 'all' ? filters.paymentStatus : null
  const searchLabel = filters.search ? `"${filters.search}"` : null
  const filterParts = [filterLabel, paymentLabel, searchLabel].filter(Boolean)
  const filterText = filterParts.join(' · ')

  const durationText = storeIsFetching
    ? '...'
    : queryDuration != null
      ? `${(queryDuration / 1000).toFixed(1)}s`
      : null

  const isDelivery = staffMode === 'delivery'
  const modeLabel = isDelivery ? 'Delivery' : 'Browse'
  const modeColor = isDelivery ? 'text-green-400' : 'text-blue-400'

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[700]">
      <div className="bg-black/60 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-full backdrop-blur-sm shadow-lg whitespace-nowrap flex items-center gap-1.5 select-none">
        {!isAdmin && (
          <>
            <span className={`font-bold ${modeColor}`}>{modeLabel}</span>
            <span className="w-px h-3 bg-white/20" />
          </>
        )}
        <span className="truncate max-w-[120px] sm:max-w-[200px] text-white/80">{filterText}</span>
        <span className="w-px h-3 bg-white/20" />
        <span>{storeIsFetching ? '...' : `${count.toLocaleString()} markers`}</span>
        {durationText && (
          <>
            <span className="w-px h-3 bg-white/20" />
            <span className="tabular-nums text-white/60">{durationText}</span>
          </>
        )}
      </div>
    </div>
  )
}
