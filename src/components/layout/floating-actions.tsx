'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useBillingStore } from '@/stores/billing-store'
import { Search, SlidersHorizontal, Layers, Image, X } from 'lucide-react'
import { MobileFilterSheet } from '@/components/filter-panel'
import { UnsentModal } from '@/components/delivery/unsent-badge'
import { useUnsentPhotos } from '@/hooks/use-unsent-photos'

export function FloatingActions() {
  const [open, setOpen] = useState(false)
  const [searchVisible, setSearchVisible] = useState(false)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  const [unsentOpen, setUnsentOpen] = useState(false)
  const selectedHouseId = useBillingStore((s) => s.selectedHouseId)
  const mapType = useBillingStore((s) => s.mapType)
  const setMapType = useBillingStore((s) => s.setMapType)
  const search = useBillingStore((s) => s.filters.search)
  const setPendingFilter = useBillingStore((s) => s.setPendingFilter)
  const { count: unsentCount } = useUnsentPhotos(5000)

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

  if (selectedHouseId) return null

  return (
    <>
      <div className="fixed right-3 top-1/2 -translate-y-1/2 z-[800]">
        {open ? (
          <div className="flex flex-col items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
            <div className="flex flex-col gap-1 p-1.5 rounded-xl bg-background/80 backdrop-blur-md border border-border shadow-lg">
              <ActionButton icon={Search} label="Search" onClick={handleSearch} />
              <ActionButton icon={SlidersHorizontal} label="Filters" onClick={handleFilter} />
              <ActionButton icon={Layers} label={mapType === 'streets' ? 'Satellite' : 'Street'} onClick={handleSatellite} active={mapType === 'satellite'} />
              <div className="relative">
                <ActionButton icon={Image} label="Unsent" onClick={handleUnsent} />
                {unsentCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] flex items-center justify-center rounded-full bg-blue-500 text-white text-[8px] font-bold px-0.5 pointer-events-none">
                    {unsentCount > 99 ? '99+' : unsentCount}
                  </span>
                )}
              </div>
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
              className="h-10 w-10 flex items-center justify-center rounded-full bg-background/80 backdrop-blur-md border border-border shadow-lg hover:bg-muted cursor-pointer"
              aria-label="Open actions"
            >
              <span className="text-base font-bold text-muted-foreground leading-none">&#x2726;</span>
            </button>
            {unsentCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] flex items-center justify-center rounded-full bg-blue-500 text-white text-[9px] font-bold px-1 pointer-events-none shadow-sm">
                {unsentCount > 99 ? '99+' : unsentCount}
              </span>
            )}
          </div>
        )}
      </div>

      {searchVisible && (
        <SlideDownSearch
          value={search}
          onChange={(v) => setPendingFilter({ search: v })}
          onClose={() => setSearchVisible(false)}
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
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer transition-colors ${
        active ? 'text-blue-500' : 'text-muted-foreground hover:text-foreground'
      }`}
      title={label}
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

function SlideDownSearch({
  value,
  onChange,
  onClose,
}: {
  value: string
  onChange: (v: string) => void
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="fixed top-0 left-0 right-0 z-[800] pt-[48px] lg:hidden animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-2 px-3 py-2 bg-background border-b shadow-sm">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            placeholder="Search name or PSID..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
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
    </div>
  )
}
