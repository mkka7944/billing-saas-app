'use client'

import { useBillingStore } from '@/stores/billing-store'
import { useHierarchy, useSurveyors } from '@/hooks/use-hierarchy'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, X } from 'lucide-react'

export function BillingFilters() {
  const filters = useBillingStore((s) => s.filters)
  const setFilters = useBillingStore((s) => s.setFilters)
  const resetFilters = useBillingStore((s) => s.resetFilters)
  const { data: hierarchy } = useHierarchy()
  const { data: surveyors } = useSurveyors()

  const activeCount = [
    filters.districts.length > 0,
    filters.tehsils.length > 0,
    filters.ucs.length > 0,
    filters.surveyor !== null,
    filters.paymentStatus !== 'all',
    filters.unitType !== null,
    filters.search !== '',
  ].filter(Boolean).length

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-card shrink-0 overflow-x-auto">
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search name or ID..."
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          className="pl-7 h-8 text-xs"
        />
      </div>

      <Select
        value={filters.paymentStatus}
        onValueChange={(v) => setFilters({ paymentStatus: (v || 'all') as typeof filters.paymentStatus })}
      >
        <SelectTrigger className="w-[100px] h-8 text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="paid">Paid</SelectItem>
          <SelectItem value="unpaid">Unpaid</SelectItem>
          <SelectItem value="overdue">Overdue</SelectItem>
        </SelectContent>
      </Select>

      {hierarchy?.districts && (
        <Select
          value={filters.districts[0] || ''}
          onValueChange={(v) => setFilters({ districts: v ? [v || ''] : [], tehsils: [], ucs: [] })}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="District" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Districts</SelectItem>
            {hierarchy.districts.map((d) => (
              <SelectItem key={d.value} value={d.value}>{d.label} ({d.count})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {surveyors && (
        <Select
          value={filters.surveyor || ''}
          onValueChange={(v) => setFilters({ surveyor: v || null })}
        >
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Surveyor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Surveyors</SelectItem>
            {surveyors.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs gap-1">
          <X className="h-3 w-3" /> Clear ({activeCount})
        </Button>
      )}
    </div>
  )
}
