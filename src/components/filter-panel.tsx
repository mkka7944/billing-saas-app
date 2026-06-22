'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { useBillingStore } from '@/stores/billing-store'
import { useHierarchy } from '@/hooks/use-hierarchy'
import { useBillMonths } from '@/hooks/use-bill-months'
import { getFilteredUcList } from '@/lib/queries/uc-list'
import { currentMonth } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { ChevronDown, X, SlidersHorizontal, Search, Check, RefreshCw, Layers } from 'lucide-react'
import { NotificationsBell } from '@/components/notifications/notifications-bell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SortSelector } from '@/components/sort-selector'
import { useGlobalSearch } from '@/hooks/use-global-search'
import SearchResultsPopover from '@/components/search-results-popover'
import type { SearchResultUnit } from '@/types/search'

// ─── Accordion Group ───────────────────────────────────────────

function FilterAccordion({
  label,
  icon,
  items,
  selected,
  onToggle,
  onSelectAll,
  onSelectNone,
  open,
  onToggleOpen,
}: {
  label: string
  icon: string
  items: { value: string; label: string; short?: string }[]
  selected: Set<string>
  onToggle: (value: string) => void
  onSelectAll: () => void
  onSelectNone: () => void
  open: boolean
  onToggleOpen: () => void
}) {
  const count = selected.size
  const total = items.length
  const allSelected = count === total && total > 0

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={onToggleOpen}
        className="flex items-center gap-2 w-full px-4 py-3 text-left cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors"
      >
        <span className="text-base">{icon}</span>
        <span className="text-xs font-bold uppercase tracking-wider flex-1">{label}</span>
        {count > 0 && (
          <span
            className={cn(
              'text-[10px] font-bold px-2 py-0.5 rounded-full',
              allSelected
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            )}
          >
            {allSelected ? 'All' : count}
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-1">
          <div className="flex gap-2 mb-2">
            <button
              onClick={onSelectAll}
              className="text-[10px] font-bold uppercase px-2 py-1 rounded border border-border hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:border-blue-800 dark:hover:text-blue-400 transition-colors cursor-pointer"
            >
              All
            </button>
            <button
              onClick={onSelectNone}
              className="text-[10px] font-bold uppercase px-2 py-1 rounded border border-border hover:bg-red-50 hover:border-red-200 hover:text-red-700 dark:hover:bg-red-950 dark:hover:border-red-800 dark:hover:text-red-400 transition-colors cursor-pointer"
            >
              None
            </button>
          </div>
          <div className="max-h-[180px] overflow-y-auto space-y-0.5 rounded-lg border border-border bg-muted/30 p-1.5">
            {items.map((item) => {
              const isSelected = selected.has(item.value)
              return (
                <label
                  key={item.value}
                  className={cn(
                    'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm cursor-pointer transition-colors select-none',
                    isSelected
                      ? 'bg-blue-50 text-blue-700 font-semibold dark:bg-blue-950 dark:text-blue-400'
                      : 'hover:bg-muted'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(item.value)}
                    className="h-4 w-4 rounded border-2 border-muted-foreground/30 accent-blue-600 cursor-pointer"
                  />
                  <span className="flex-1 text-xs">{item.short || item.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Filter Panel Inner (shared between mobile/desktop) ────────

function FilterPanelInner({ onClose }: { onClose?: () => void }) {
  const filters = useBillingStore((s) => s.pendingFilters)
  const selectedCity = useBillingStore((s) => s.selectedCity)
  const setFilters = useBillingStore((s) => s.setPendingFilter)
  const applyFilters = useBillingStore((s) => s.applyFilters)
  const cancelFilters = useBillingStore((s) => s.cancelFilters)
  const resetFilters = useBillingStore((s) => s.resetFilters)
  const { data: hierarchy } = useHierarchy()

  const [openSection, setOpenSection] = useState<string | null>('mcuc')

  const ucs = useMemo(() => getFilteredUcList(hierarchy, selectedCity), [selectedCity, hierarchy])

  const toggleFilter = useCallback(
    (group: 'ucs', value: string) => {
      const current = new Set(filters[group])
      if (current.has(value)) current.delete(value)
      else current.add(value)
      setFilters({ [group]: [...current] })
    },
    [filters, setFilters]
  )

  const selectAll = useCallback(
    (group: 'ucs', items: { value: string }[]) => {
      setFilters({ [group]: items.map((i) => i.value) })
    },
    [setFilters]
  )

  const selectNone = useCallback(
    (group: 'ucs') => {
      setFilters({ [group]: [] })
    },
    [setFilters]
  )

  const hasActiveFilters = filters.ucs.length > 0

  return (
    <div className="flex flex-col">
      {onClose && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-bold">Filters</span>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={() => { resetFilters() }}
                className="text-xs font-bold uppercase text-red-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950 transition-colors cursor-pointer"
              >
                Reset
              </button>
            )}
            <button
              onClick={() => { cancelFilters(); onClose() }}
              className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="overflow-y-auto">
        {/* Payment Status */}
        <div className="px-4 py-3 border-b border-border">
          <Select
            value={filters.paymentStatus}
            onValueChange={(v) => setFilters({ paymentStatus: (v || 'all') as 'all' | 'paid' | 'unpaid' })}
          >
            <SelectTrigger className="h-10 text-sm w-full">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Surveyor */}
        {hierarchy?.surveyors && hierarchy.surveyors.length > 0 && (
          <div className="px-4 py-3 border-b border-border">
            <Select
              value={filters.surveyor || ''}
              onValueChange={(v) => setFilters({ surveyor: v || null })}
            >
              <SelectTrigger className="h-10 text-sm w-full">
                <SelectValue placeholder="All Surveyors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Surveyors</SelectItem>
                {hierarchy.surveyors.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Sort */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-xs font-bold uppercase tracking-wider">Sort By</span>
          <SortSelector />
        </div>

        <FilterAccordion
          label="MC/UC Areas"
          icon="🗺"
          items={ucs}
          selected={new Set(filters.ucs)}
          onToggle={(v) => toggleFilter('ucs', v)}
          onSelectAll={() => selectAll('ucs', ucs)}
          onSelectNone={() => selectNone('ucs')}
          open={openSection === 'mcuc'}
          onToggleOpen={() => setOpenSection(openSection === 'mcuc' ? null : 'mcuc')}
        />
      </div>

      {onClose && (
        <div className="mt-auto border-t border-border p-4 flex gap-3">
          <button
            onClick={() => { cancelFilters(); onClose() }}
            className="flex-1 h-12 rounded-xl border border-border text-sm font-bold hover:bg-muted transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => { applyFilters(); onClose() }}
            className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Desktop: Inline Filter Bar ─────────────────────────────────

function DropdownPortal({ pos, children }: { pos: { top: number; left: number; width: number }; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null
  return createPortal(
    <div
      className="fixed z-[9999] bg-popover border border-border rounded-lg shadow-lg p-2 max-h-[280px] overflow-y-auto"
      style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
    >
      {children}
    </div>,
    document.body
  )
}

function FilterDropdown({
  id,
  label,
  items,
  selected,
  onToggle,
  onSelectAll,
  onSelectNone,
  disabled,
  className,
}: {
  id: string
  label: string
  items: { value: string; label: string; short?: string }[]
  selected: Set<string>
  onToggle: (value: string) => void
  onSelectAll: () => void
  onSelectNone: () => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 200) })
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => { if (!disabled) setOpen(!open) }}
        disabled={disabled}
        className={cn(
          'h-8 text-xs font-bold rounded-lg border px-3 flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
          selected.size > 0
            ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-400'
            : 'border-border hover:bg-muted',
          className
        )}
      >
        {label}{selected.size > 0 ? ` (${selected.size})` : ''}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <DropdownPortal pos={pos}>
            <div className="flex gap-2 mb-2 px-1">
              <button onClick={() => { onSelectAll(); setOpen(false) }} className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer">All</button>
              <button onClick={() => { onSelectNone(); setOpen(false) }} className="text-[10px] font-bold uppercase text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 cursor-pointer">None</button>
            </div>
            {items.map((item) => (
              <label key={item.value} className={cn(
                'flex items-center gap-2 px-2.5 py-2 rounded-md text-xs cursor-pointer hover:bg-muted transition-colors select-none',
                selected.has(item.value) && 'bg-blue-50 text-blue-700 font-semibold dark:bg-blue-950 dark:text-blue-400'
              )}>
                <input type="checkbox" checked={selected.has(item.value)} onChange={() => onToggle(item.value)} className="h-3.5 w-3.5 accent-blue-600 cursor-pointer" />
                {item.short || item.label}
              </label>
            ))}
          </DropdownPortal>
        </>
      )}
    </>
  )
}

const PENDING_DEFAULTS = {
  districts: [] as string[],
  tehsils: [] as string[],
  ucs: [] as string[],
  surveyor: null as string | null,
  paymentStatus: 'all' as 'all' | 'paid' | 'unpaid',
  search: '',
  billMonth: currentMonth(),
  sort: { field: 'survey_id', direction: 'desc' },
}

export function DesktopFilterBar() {
  const filters = useBillingStore((s) => s.filters)
  const pendingFilters = useBillingStore((s) => s.pendingFilters)
  const selectedCity = useBillingStore((s) => s.selectedCity)
  const setPendingFilter = useBillingStore((s) => s.setPendingFilter)
  const setFilters = useBillingStore((s) => s.setFilters)
  const setDeliverTarget = useBillingStore((s) => s.setDeliverTarget)
  const selectHouse = useBillingStore((s) => s.selectHouse)
  const setSearchResult = useBillingStore((s) => s.setSearchResult)
  const { data: hierarchy } = useHierarchy()
  const { data: billMonths } = useBillMonths()

  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const [searchPopoverPos, setSearchPopoverPos] = useState({ top: 0, left: 0, width: 0 })

  const globalSearch = useGlobalSearch({ scope: 'global' })

  useEffect(() => {
    if (globalSearch.showResults && searchRef.current) {
      const rect = searchRef.current.getBoundingClientRect()
      setSearchPopoverPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 320) })
    }
  }, [globalSearch.showResults, globalSearch.results])

  const handleSearchResultMap = useCallback((result: SearchResultUnit) => {
    const unit = { psid: result.psid || '', survey_id: result.survey_id, consumer_name: result.consumer_name, address: result.address, lat: result.lat, lng: result.lng, uc_name: result.uc_name, monthly_fee: null, arrears: null, route_name: null, route_seq: null, image_urls: [] }
    setSearchResult(result)
    setDeliverTarget(result.psid || '', unit)
    globalSearch.clearResults()
  }, [setSearchResult, setDeliverTarget, globalSearch])

  const handleSearchResultDetails = useCallback((result: SearchResultUnit) => {
    const surveyUnit = { survey_id: result.survey_id || '', consumer_name: result.consumer_name, address: result.address, lat: result.lat, lng: result.lng, psid: result.psid || '', uc_name: result.uc_name, arrears: null, current_bill_month: null, route_name: null, route_seq: null, image_urls: null, city_district: null, tehsil: null, surveyor_name: null, survey_date: null, survey_time: null, monthly_fee: 0, billing_category: '', status: '' }
    setSearchResult(null)
    setDeliverTarget(result.psid || '', { psid: result.psid || '', survey_id: result.survey_id, consumer_name: result.consumer_name, address: result.address, lat: result.lat, lng: result.lng, uc_name: result.uc_name, monthly_fee: null, arrears: null, route_name: null, route_seq: null, image_urls: [] })
    selectHouse(result.survey_id, [surveyUnit])
    globalSearch.clearResults()
  }, [setSearchResult, setDeliverTarget, selectHouse, globalSearch])

  const ucs = useMemo(() => getFilteredUcList(hierarchy, selectedCity), [selectedCity, hierarchy])

  const activeFilterCount = [
    pendingFilters.ucs.length,
    pendingFilters.surveyor !== null,
    pendingFilters.paymentStatus !== 'all',
    pendingFilters.search !== '',
  ].filter(Boolean).length

  const hasActiveFilters = activeFilterCount > 0

  const toggleSelect = useCallback(
    (group: 'ucs', value: string) => {
      const current = new Set(pendingFilters[group])
      if (current.has(value)) current.delete(value)
      else current.add(value)
      setPendingFilter({ [group]: [...current] })
    },
    [pendingFilters, setPendingFilter]
  )

  const resetPendingFilters = useCallback(() => {
    setFilters({
      districts: filters.districts,
      tehsils: [],
      ucs: [],
      surveyor: null,
      paymentStatus: 'all',
      search: '',
      billMonth: currentMonth(),
      sort: filters.sort,
    })
  }, [setFilters, filters.districts])

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/20 shrink-0">
      {/* Left group: filters */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Payment Status */}
        <Select
          value={pendingFilters.paymentStatus}
          onValueChange={(v) => setPendingFilter({ paymentStatus: (v || 'all') as typeof pendingFilters.paymentStatus })}
        >
          <SelectTrigger className="w-[100px] h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="z-[9999]">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
          </SelectContent>
        </Select>

        {/* Bill Month */}
        <Select
          value={pendingFilters.billMonth || ''}
          onValueChange={(v) => setPendingFilter({ billMonth: v || null })}
        >
          <SelectTrigger className="w-[110px] h-8 text-xs">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent className="z-[9999]">
            {(billMonths || []).map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="w-px h-5 bg-border/60 mx-0.5 shrink-0" />

        {/* MC/UC */}
        <FilterDropdown
          key={`mcuc-${selectedCity || 'all'}`}
          id="mcuc"
          label="MC/UC"
          items={ucs}
          selected={new Set(pendingFilters.ucs)}
          onToggle={(v) => toggleSelect('ucs', v)}
          onSelectAll={() => { setPendingFilter({ ucs: ucs.map((u) => u.value) }) }}
          onSelectNone={() => { setPendingFilter({ ucs: [] }) }}
          className="min-w-[80px]"
        />

        {/* Surveyor */}
        {hierarchy?.surveyors && hierarchy.surveyors.length > 0 && (
          <>
            <div className="w-px h-5 bg-border/60 mx-0.5 shrink-0" />
            <Select
              value={pendingFilters.surveyor || ''}
              onValueChange={(v) => setPendingFilter({ surveyor: v || null })}
            >
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="Surveyor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Surveyors</SelectItem>
                {hierarchy.surveyors.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {hasActiveFilters && (
          <>
            <div className="w-px h-6 bg-border mx-1 shrink-0" />
            <button
              onClick={resetPendingFilters}
              className="h-8 text-xs font-bold text-red-500 hover:text-red-600 px-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 transition-colors whitespace-nowrap cursor-pointer shrink-0"
            >
              Clear ({activeFilterCount})
            </button>
          </>
        )}
      </div>

      {/* Center: search */}
      <div className="flex-1 flex justify-center px-4">
        <div ref={searchRef} className={cn(
          'relative flex items-center rounded-lg border transition-colors w-full max-w-[400px]',
          searchFocused ? 'border-primary ring-1 ring-primary/20 shadow-sm' : 'border-border hover:border-muted-foreground/30'
        )}>
          <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search PSID or SID..."
            value={pendingFilters.search}
            onChange={(e) => {
              setFilters({ search: e.target.value })
              setSearchResult(null)
              globalSearch.setQuery(e.target.value)
            }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            className="pl-9 h-9 text-sm border-0 ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {pendingFilters.search && (
            <button
              onClick={() => {
                setFilters({ search: '' })
                setSearchResult(null)
                globalSearch.clearResults()
              }}
              className="absolute right-1.5 h-7 w-7 flex items-center justify-center rounded hover:bg-muted cursor-pointer"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {globalSearch.showResults && searchPopoverPos.top > 0 && createPortal(
        <div
          className="fixed z-[9999] bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
          style={{ top: searchPopoverPos.top, left: searchPopoverPos.left, minWidth: searchPopoverPos.width }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <SearchResultsPopover
            results={globalSearch.results}
            isSearching={globalSearch.isSearching}
            onViewOnMap={handleSearchResultMap}
            onViewDetails={handleSearchResultDetails}
          />
        </div>,
        document.body
      )}

      {/* Right group: actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <SortSelector />
        <ActionButtons />
      </div>
    </div>
  )
}

function ActionButtons() {
  const filters = useBillingStore((s) => s.filters)
  const pendingFilters = useBillingStore((s) => s.pendingFilters)
  const applyFilters = useBillingStore((s) => s.applyFilters)
  const cancelFilters = useBillingStore((s) => s.cancelFilters)
  const queryClient = useQueryClient()
  const mapType = useBillingStore((s) => s.mapType)
  const setMapType = useBillingStore((s) => s.setMapType)

  const queryDuration = useBillingStore((s) => s.queryDuration)
  const isFetching = useIsFetching() > 0
  const [showSuccess, setShowSuccess] = useState(false)
  const successTimer = useRef<number>(0)

  const hasUnapplied = useMemo(
    () => JSON.stringify(filters) !== JSON.stringify(pendingFilters),
    [filters, pendingFilters]
  )

  const isRefreshing = isFetching

  // Show "✓ duration" after fetch completes
  useEffect(() => {
    if (!isFetching && queryDuration != null) {
      setShowSuccess(true)
      window.clearTimeout(successTimer.current)
      successTimer.current = window.setTimeout(() => setShowSuccess(false), 2000)
    }
    return () => { window.clearTimeout(successTimer.current) }
  }, [isFetching, queryDuration])

  const handleUpdate = useCallback(() => {
    queryClient.invalidateQueries()
  }, [queryClient])

  return (
    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
      <NotificationsBell />
      <button
        onClick={() => setMapType(mapType === 'streets' ? 'satellite' : 'streets')}
        className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted cursor-pointer shrink-0"
        title={mapType === 'streets' ? 'Satellite' : 'Street'}
      >
        <Layers className="h-3.5 w-3.5" />
      </button>
      <div className="w-px h-5 bg-border/60 mx-0.5 shrink-0" />
      <div className="relative">
        <button
          onClick={handleUpdate}
          disabled={isRefreshing}
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          title={isRefreshing ? 'Updating...' : showSuccess ? 'Updated' : 'Refresh data'}
        >
          <RefreshCw
            className={cn(
              'h-3.5 w-3.5 transition-none',
              isRefreshing && 'animate-spin'
            )}
          />
        </button>
        {showSuccess && (
          <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-green-500 flex items-center justify-center animate-in zoom-in duration-150">
            <Check className="h-2.5 w-2.5 text-white" />
          </span>
        )}
      </div>

      {isRefreshing && (
        <span className="text-[10px] text-muted-foreground font-medium tabular-nums">...</span>
      )}

      {showSuccess && !isRefreshing && (
        <span className="text-[10px] text-green-600 dark:text-green-300 font-medium tabular-nums animate-in fade-in duration-150">✓ {(queryDuration! / 1000).toFixed(1)}s</span>
      )}

      {hasUnapplied && (
        <>
          <div className="w-px h-5 bg-border/60 mx-0.5 shrink-0" />
          <button
            onClick={cancelFilters}
            className="h-8 text-xs font-bold px-2.5 rounded-lg border border-border hover:bg-muted cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={applyFilters}
            className="h-8 text-xs font-bold px-3 rounded-lg flex items-center gap-1 bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Check className="h-3 w-3" />
            Apply
          </button>
        </>
      )}
    </div>
  )
}

// ─── Mobile: Bottom Sheet ──────────────────────────────────────

export function MobileFilterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cancelFilters = useBillingStore((s) => s.cancelFilters)

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[800] flex flex-col">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { cancelFilters(); onClose() }} />
          <div
            className={cn(
              'absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl shadow-2xl flex flex-col max-h-[85vh] z-10',
              'animate-in slide-in-from-bottom-2 duration-300 ease-out'
            )}
          >
            <div className="flex justify-center pt-2.5 pb-2 shrink-0">
              <div className="w-9 h-1 rounded-full bg-muted-foreground/20" />
            </div>
            <div className="flex-1 overflow-y-auto">
              <FilterPanelInner onClose={onClose} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
