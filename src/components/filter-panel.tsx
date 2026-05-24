'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useBillingStore } from '@/stores/billing-store'
import { useHierarchy } from '@/hooks/use-hierarchy'
import { useBillMonths } from '@/hooks/use-bill-months'
import { shortenMCName, compareMC } from '@/lib/mc-utils'
import { cn } from '@/lib/utils'
import { ChevronDown, X, SlidersHorizontal, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
  const filters = useBillingStore((s) => s.filters)
  const setFilters = useBillingStore((s) => s.setFilters)
  const resetFilters = useBillingStore((s) => s.resetFilters)
  const { data: hierarchy } = useHierarchy()

  const [openSection, setOpenSection] = useState<string | null>('district')

  const districts = hierarchy?.districts || []

  const tehsils = useMemo(() => {
    if (!filters.districts.length) {
      return Object.values(hierarchy?.tehsils || {}).flat()
    }
    return filters.districts.flatMap((d) => hierarchy?.tehsils[d] || [])
  }, [filters.districts, hierarchy])

  const ucs = useMemo(() => {
    if (!filters.districts.length && !filters.tehsils.length) {
      return Object.values(hierarchy?.ucs || {})
        .flat()
        .map((u) => ({
          ...u,
          short: shortenMCName(u.value),
        }))
        .sort((a, b) => compareMC(a.short, b.short))
    }
    const list: { value: string; label: string; short: string }[] = []
    const dists = filters.districts.length ? filters.districts : districts.map((d) => d.value)
    const tehls = filters.tehsils.length ? filters.tehsils : tehsils.map((t) => t.value)
    for (const d of dists) {
      for (const t of tehls) {
        const key = `${d}::${t}`
        const group = hierarchy?.ucs[key] || []
        for (const u of group) {
          list.push({ ...u, short: shortenMCName(u.value, d, t) })
        }
      }
    }
    return list.sort((a, b) => compareMC(a.short, b.short))
  }, [filters.districts, filters.tehsils, hierarchy, districts, tehsils])

  const toggleFilter = useCallback(
    (group: 'districts' | 'tehsils' | 'ucs', value: string) => {
      const current = new Set(filters[group])
      if (current.has(value)) current.delete(value)
      else current.add(value)
      setFilters({ [group]: [...current] })
    },
    [filters, setFilters]
  )

  const selectAll = useCallback(
    (group: 'districts' | 'tehsils' | 'ucs', items: { value: string }[]) => {
      setFilters({ [group]: items.map((i) => i.value) })
    },
    [setFilters]
  )

  const selectNone = useCallback(
    (group: 'districts' | 'tehsils' | 'ucs') => {
      setFilters({ [group]: [] })
    },
    [setFilters]
  )

  const hasActiveFilters = filters.districts.length > 0 || filters.tehsils.length > 0 || filters.ucs.length > 0

  return (
    <div className="flex flex-col">
      {onClose && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-bold">Filters</span>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={() => { resetFilters() }}
                className="text-[11px] font-bold uppercase text-red-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950 transition-colors cursor-pointer"
              >
                Reset
              </button>
            )}
            <button
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="overflow-y-auto">
        <FilterAccordion
          label="Districts"
          icon="🏛"
          items={districts}
          selected={new Set(filters.districts)}
          onToggle={(v) => {
            toggleFilter('districts', v)
            if (!filters.districts.includes(v)) {
              setFilters({ tehsils: [], ucs: [] })
            }
          }}
          onSelectAll={() => selectAll('districts', districts)}
          onSelectNone={() => { selectNone('districts'); setFilters({ tehsils: [], ucs: [] }) }}
          open={openSection === 'district'}
          onToggleOpen={() => setOpenSection(openSection === 'district' ? null : 'district')}
        />

        <FilterAccordion
          label="Tehsils"
          icon="📍"
          items={tehsils}
          selected={new Set(filters.tehsils)}
          onToggle={(v) => {
            toggleFilter('tehsils', v)
            if (!filters.tehsils.includes(v)) {
              setFilters({ ucs: [] })
            }
          }}
          onSelectAll={() => selectAll('tehsils', tehsils)}
          onSelectNone={() => { selectNone('tehsils'); setFilters({ ucs: [] }) }}
          open={openSection === 'tehsil'}
          onToggleOpen={() => setOpenSection(openSection === 'tehsil' ? null : 'tehsil')}
        />

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
        <div className="mt-auto border-t border-border p-3">
          <Button onClick={onClose} className="w-full h-10 text-sm font-bold">
            Done
          </Button>
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
              <button onClick={() => { onSelectAll(); setOpen(false) }} className="text-[10px] font-bold uppercase text-blue-600 hover:text-blue-700 cursor-pointer">All</button>
              <button onClick={() => { onSelectNone(); setOpen(false) }} className="text-[10px] font-bold uppercase text-red-500 hover:text-red-600 cursor-pointer">None</button>
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

export function DesktopFilterBar() {
  const filters = useBillingStore((s) => s.filters)
  const setFilters = useBillingStore((s) => s.setFilters)
  const resetFilters = useBillingStore((s) => s.resetFilters)
  const { data: hierarchy } = useHierarchy()
  const { data: billMonths } = useBillMonths()

  const [searchFocused, setSearchFocused] = useState(false)

  const districts = hierarchy?.districts || []

  const tehsils = useMemo(() => {
    if (!filters.districts.length) return []
    return filters.districts.flatMap((d) => hierarchy?.tehsils[d] || [])
  }, [filters.districts, hierarchy])

  const ucs = useMemo(() => {
    const list: { value: string; label: string; short: string }[] = []
    const dists = filters.districts.length ? filters.districts : []
    const tehls = filters.tehsils.length ? filters.tehsils : []
    if (!dists.length || !tehls.length) return list
    for (const d of dists) {
      for (const t of tehls) {
        const group = hierarchy?.ucs[`${d}::${t}`] || []
        for (const u of group) {
          list.push({ ...u, short: shortenMCName(u.value, d, t) })
        }
      }
    }
    return list.sort((a, b) => compareMC(a.short, b.short))
  }, [filters.districts, filters.tehsils, hierarchy])

  const activeFilterCount = [
    filters.districts.length,
    filters.tehsils.length,
    filters.ucs.length,
    filters.surveyor !== null,
    filters.paymentStatus !== 'all',
    filters.search !== '',
  ].filter(Boolean).length

  const hasActiveFilters = activeFilterCount > 0

  const toggleSelect = useCallback(
    (group: 'districts' | 'tehsils' | 'ucs', value: string) => {
      const current = new Set(filters[group])
      if (current.has(value)) current.delete(value)
      else current.add(value)
      const update: Partial<Record<'districts' | 'tehsils' | 'ucs', string[]>> = { [group]: [...current] }
      if (group === 'districts') { update.tehsils = []; update.ucs = [] }
      if (group === 'tehsils') { update.ucs = [] }
      setFilters(update)
    },
    [filters, setFilters]
  )

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b bg-background shrink-0">
      {/* Search */}
      <div className={cn(
        'relative flex items-center rounded-lg border transition-colors shrink-0',
        searchFocused ? 'border-primary ring-1 ring-primary/20' : 'border-border'
      )}>
        <Search className="absolute left-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search name or ID..."
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className="pl-7 h-8 text-xs border-0 ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 w-[160px]"
        />
        {filters.search && (
          <button
            onClick={() => setFilters({ search: '' })}
            className="absolute right-1 h-6 w-6 flex items-center justify-center rounded hover:bg-muted cursor-pointer"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Payment Status */}
      <Select
        value={filters.paymentStatus}
        onValueChange={(v) => setFilters({ paymentStatus: (v || 'all') as typeof filters.paymentStatus })}
      >
        <SelectTrigger className="w-[100px] h-8 text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent className="z-[9999]">
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="paid">Paid</SelectItem>
          <SelectItem value="unpaid">Unpaid</SelectItem>
          <SelectItem value="overdue">Overdue</SelectItem>
        </SelectContent>
      </Select>

      {/* Bill Month */}
      <Select
        value={filters.billMonth || ''}
        onValueChange={(v) => setFilters({ billMonth: v || null })}
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

      {/* District */}
      <FilterDropdown
        id="district"
        label="District"
        items={districts}
        selected={new Set(filters.districts)}
        onToggle={(v) => toggleSelect('districts', v)}
        onSelectAll={() => { setFilters({ districts: districts.map((d) => d.value), tehsils: [], ucs: [] }) }}
        onSelectNone={() => { setFilters({ districts: [], tehsils: [], ucs: [] }) }}
      />

      {/* Tehsil */}
      <FilterDropdown
        id="tehsil"
        label="Tehsil"
        items={tehsils}
        selected={new Set(filters.tehsils)}
        onToggle={(v) => toggleSelect('tehsils', v)}
        onSelectAll={() => { setFilters({ tehsils: tehsils.map((t) => t.value), ucs: [] }) }}
        onSelectNone={() => { setFilters({ tehsils: [], ucs: [] }) }}
        disabled={!filters.districts.length}
      />

      {/* MC/UC */}
      <FilterDropdown
        id="mcuc"
        label="MC/UC"
        items={ucs}
        selected={new Set(filters.ucs)}
        onToggle={(v) => toggleSelect('ucs', v)}
        onSelectAll={() => { setFilters({ ucs: ucs.map((u) => u.value) }) }}
        onSelectNone={() => { setFilters({ ucs: [] }) }}
        disabled={!filters.tehsils.length}
        className="min-w-[80px]"
      />

      {/* Surveyor */}
      {hierarchy?.surveyors && hierarchy.surveyors.length > 0 && (
        <Select
          value={filters.surveyor || ''}
          onValueChange={(v) => setFilters({ surveyor: v || null })}
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
      )}

      {hasActiveFilters && (
        <>
          <div className="w-px h-6 bg-border mx-1 shrink-0" />
          <button
            onClick={() => resetFilters()}
            className="h-8 text-[11px] font-bold text-red-500 hover:text-red-600 px-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 transition-colors whitespace-nowrap cursor-pointer shrink-0"
          >
            Clear ({activeFilterCount})
          </button>
        </>
      )}
    </div>
  )
}

// ─── Mobile: Bottom Sheet ──────────────────────────────────────

export function MobileFilterSheet() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-8 px-3 text-xs font-bold rounded-lg border border-border hover:bg-muted flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl shadow-xl flex flex-col max-h-[80vh] z-10',
              'animate-in slide-in-from-bottom duration-200'
            )}
          >
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="flex-1 overflow-y-auto">
              <FilterPanelInner onClose={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
