'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useBillingStore } from '@/stores/billing-store'
import { useAuthStore } from '@/stores/auth-store'
import { Search, SlidersHorizontal, Layers, Image, X, Crosshair, Map, PanelRightClose, RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { MobileFilterSheet } from '@/components/filter-panel'
import { UnsentModal } from '@/components/delivery/unsent-badge'
import { usePhotoQueue } from '@/hooks/use-photo-queue'
import { useLiveStore } from '@/stores/live-store'
import { useGlobalSearch } from '@/hooks/use-global-search'
import { refreshCurrentPage } from '@/lib/queries/refresh'
import SearchResultsPopover from '@/components/search-results-popover'
import type { SearchResultUnit } from '@/types/search'
import type { SearchMode } from '@/types'

export function FloatingActions() {
  const [open, setOpen] = useState(false)
  const [searchVisible, setSearchVisible] = useState(false)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  const [unsentOpen, setUnsentOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const activeView = useBillingStore((s) => s.activeView)
  const selectedHouseId = useBillingStore((s) => s.selectedHouseId)
  const mapType = useBillingStore((s) => s.mapType)
  const setMapType = useBillingStore((s) => s.setMapType)
  const setFilters = useBillingStore((s) => s.setFilters)
  const setDeliverTarget = useBillingStore((s) => s.setDeliverTarget)
  const selectHouse = useBillingStore((s) => s.selectHouse)
  const setSearchResult = useBillingStore((s) => s.setSearchResult)
  const staffMode = useBillingStore((s) => s.staffMode)
  const setStaffMode = useBillingStore((s) => s.setStaffMode)
  const panelCollapsed = useLiveStore((s) => s.panelCollapsed)
  const setPanelCollapsed = useLiveStore((s) => s.setPanelCollapsed)
  const roleName = useAuthStore((s) => s.roleName)
  const { queueCount: unsentCount } = usePhotoQueue()

  const isMap = pathname?.startsWith('/map')
  const isDeliver = pathname?.startsWith('/deliver')

  const searchScope = isDeliver ? 'assignment' : 'global'
  const globalSearch = useGlobalSearch({ scope: searchScope })

  const handleSearchResultMap = useCallback((result: SearchResultUnit) => {
    const unit = { psid: result.psid || '', survey_id: result.survey_id, consumer_name: result.consumer_name, address: result.address, lat: result.lat, lng: result.lng, uc_name: result.uc_name, monthly_fee: null, arrears: null, route_name: null, route_seq: null, image_urls: [] }
    if (!isDeliver) {
      setSearchResult(result)
    }
    setDeliverTarget(result.psid || '', unit)
    globalSearch.clearResults()
    setSearchVisible(false)
    if (isDeliver) {
      router.push(`/map?target=${encodeURIComponent(result.psid || '')}`)
    }
  }, [setSearchResult, setDeliverTarget, globalSearch, isDeliver, router])

  const handleSearchResultDetails = useCallback((result: SearchResultUnit) => {
    const surveyUnit = { survey_id: result.survey_id || '', consumer_name: result.consumer_name, address: result.address, lat: result.lat, lng: result.lng, psid: result.psid || '', uc_name: result.uc_name, arrears: null, current_bill_month: null, route_name: null, route_seq: null, image_urls: null, city_district: null, tehsil: null, surveyor_name: null, survey_date: null, survey_time: null, monthly_fee: 0, billing_category: '', status: '' }
    if (isDeliver) {
      setSearchResult(result)
      globalSearch.clearResults()
      setSearchVisible(false)
    } else {
      setSearchResult(null)
      setDeliverTarget(result.psid || '', { psid: result.psid || '', survey_id: result.survey_id, consumer_name: result.consumer_name, address: result.address, lat: result.lat, lng: result.lng, uc_name: result.uc_name, monthly_fee: null, arrears: null, route_name: null, route_seq: null, image_urls: [] })
      selectHouse(result.survey_id, [surveyUnit])
      globalSearch.clearResults()
      setSearchVisible(false)
    }
  }, [setSearchResult, setDeliverTarget, selectHouse, globalSearch, isDeliver])

  useEffect(() => {
    if (selectedHouseId) {
      setOpen(false)
      setSearchVisible(false)
      setMobileFilterOpen(false)
    }
  }, [selectedHouseId])

  const handleSearch = useCallback(() => {
    setOpen(false)
    setSearchVisible((v) => !v)
  }, [])

  const handleFilter = useCallback(() => {
    setOpen(false)
    setMobileFilterOpen(true)
  }, [])

  const handleSatellite = useCallback(() => {
    setOpen(false)
    setMapType(mapType === 'streets' ? 'satellite' : 'streets')
  }, [mapType, setMapType])

  const handleUnsent = useCallback(() => {
    setOpen(false)
    setUnsentOpen(true)
  }, [])

  const handleRefresh = useCallback(() => {
    setOpen(false)
    refreshCurrentPage(pathname, queryClient)
  }, [pathname, queryClient])

  if (selectedHouseId) return null
  if (!isMap && !isDeliver) return null

  const isLive = activeView === 'live'

  return (
    <>
      <div className="fixed right-3 top-1/2 -translate-y-1/2 z-[800]">
        {open ? (
          <div className="flex flex-col items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
            <div className="flex flex-col gap-1 p-2 rounded-xl bg-background/95 backdrop-blur-md border border-border shadow-2xl">
              <div className="lg:hidden">
                <ActionButton icon={Search} label="Search" onClick={handleSearch} disabled={isLive} />
              </div>
              <ActionButton icon={RefreshCw} label="Refresh" onClick={handleRefresh} disabled={isLive} />
              {isMap && (
                <ActionButton icon={SlidersHorizontal} label="Filters" onClick={handleFilter} disabled={isLive} />
              )}
              {isMap && (
                <ActionButton icon={Layers} label={mapType === 'streets' ? 'Satellite' : 'Street'} onClick={handleSatellite} active={mapType === 'satellite'} />
              )}
              {isMap && roleName === 'field_staff' && (
                <div className="relative">
                  <ActionButton
                    icon={staffMode === 'delivery' ? Crosshair : Map}
                    label={staffMode === 'delivery' ? 'Browse City' : 'Deliver'}
                    onClick={() => setStaffMode(staffMode === 'delivery' ? 'browse' : 'delivery')}
                    active={staffMode === 'browse'}
                    disabled={isLive}
                  />
                </div>
              )}
              <div className="relative">
                <ActionButton icon={Image} label="Photos" onClick={handleUnsent} disabled={isLive} />
                {unsentCount > 0 && !isLive && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-[16px] flex items-center justify-center rounded-full bg-blue-500 text-white text-[9px] font-bold px-1 pointer-events-none shadow-sm ring-2 ring-background">
                    {unsentCount > 99 ? '99+' : unsentCount}
                  </span>
                )}
              </div>
              {isMap && isLive && (
                <ActionButton
                  icon={panelCollapsed ? PanelRightClose : PanelRightClose}
                  label={panelCollapsed ? 'Expand Panel' : 'Collapse Panel'}
                  onClick={() => setPanelCollapsed(!panelCollapsed)}
                />
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-8 w-8 flex items-center justify-center rounded-full bg-background/80 backdrop-blur-md border border-border hover:bg-muted cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <button
              onClick={() => setOpen(true)}
              className="h-10 w-10 flex items-center justify-center rounded-full bg-background/80 backdrop-blur-md border border-border shadow-lg shadow-primary/20 hover:bg-muted cursor-pointer"
              aria-label="Open actions"
            >
              <span className="text-base font-bold text-muted-foreground leading-none">&#x2726;</span>
            </button>
            {unsentCount > 0 && !isLive && (
              <span className="absolute -top-1 -right-1 h-5 min-w-[20px] flex items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-bold px-1.5 pointer-events-none shadow-md ring-2 ring-background">
                {unsentCount > 99 ? '99+' : unsentCount}
              </span>
            )}
          </div>
        )}
      </div>

      {searchVisible && (
        <SlideDownSearch
          value={globalSearch.query}
          onChange={(v) => {
            setFilters({ search: v })
            setSearchResult(null)
            globalSearch.setQuery(v)
          }}
          onClose={() => {
            globalSearch.clearResults()
            setSearchResult(null)
            setSearchVisible(false)
          }}
          results={globalSearch.results}
          isSearching={globalSearch.isSearching}
          onViewOnMap={handleSearchResultMap}
          onViewDetails={handleSearchResultDetails}
        />
      )}

      <MobileFilterSheet open={mobileFilterOpen} onClose={() => setMobileFilterOpen(false)} />
      <UnsentModal open={unsentOpen} onClose={() => setUnsentOpen(false)} />
    </>
  )
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={`flex items-center gap-2 h-10 w-full px-2 rounded-lg transition-colors ${
        disabled
          ? 'opacity-30 cursor-default text-muted-foreground'
          : 'hover:bg-muted cursor-pointer'
      } ${
        active ? 'text-blue-500 bg-blue-500/10' : 'text-muted-foreground hover:text-foreground'
      }`}
      title={disabled ? `Unavailable in Live mode` : label}
      aria-label={label}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="text-xs font-medium truncate">{label}</span>
    </button>
  )
}

const SEARCH_MODES: { value: SearchMode; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'psid', label: 'PSID' },
  { value: 'sid', label: 'SID' },
]

function SlideDownSearch({
  value,
  onChange,
  onClose,
  results,
  isSearching,
  onViewOnMap,
  onViewDetails,
}: {
  value: string
  onChange: (v: string) => void
  onClose: () => void
  results: SearchResultUnit[]
  isSearching: boolean
  onViewOnMap: (result: SearchResultUnit) => void
  onViewDetails: (result: SearchResultUnit) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const searchMode = useBillingStore((s) => s.filters.searchMode || 'both')
  const setFilters = useBillingStore((s) => s.setFilters)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const showMapButton = results.some(r => r.lat != null && r.lng != null)
  const showDetailsButton = results.some(r => r.survey_id != null)

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] pt-[48px] lg:hidden animate-in slide-in-from-top-2 duration-200">
      <div className="flex flex-col bg-background border-b shadow-sm">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              placeholder="Search name or PSID..."
              value={value}
              onChange={(e) => onChange(e.target.value)}
              inputMode={searchMode === 'both' ? 'text' : 'numeric'}
              className="w-full h-10 pl-8 pr-8 text-sm rounded-lg border border-border bg-muted/30 outline-none focus:ring-1 focus:ring-ring"
            />
            {value && (
              <button
                onClick={() => onChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded hover:bg-muted cursor-pointer"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="h-10 px-3 text-xs font-bold rounded-lg border border-border hover:bg-muted cursor-pointer shrink-0"
          >
            Cancel
          </button>
        </div>

        {/* Search mode segmented control */}
        <div className="flex items-center justify-center px-3 pb-2">
          <div className="inline-flex border border-border rounded-lg overflow-hidden">
            {SEARCH_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setFilters({ searchMode: m.value })}
                className={`px-3 py-1 text-[10px] font-semibold transition-colors cursor-pointer ${
                  searchMode === m.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                } ${m.value === 'both' ? '' : 'border-l border-border'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {(value.length > 0) && (
          <div className="max-h-[50vh] overflow-y-auto border-t border-border">
            <SearchResultsPopover
              results={results}
              isSearching={isSearching}
              showMapButton={showMapButton}
              showListButton={false}
              showDetailsButton={showDetailsButton}
              onViewOnMap={onViewOnMap}
              onViewDetails={onViewDetails}
            />
          </div>
        )}
      </div>
    </div>
  )
}
