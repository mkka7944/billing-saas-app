'use client'

import { useBillingStore } from '@/stores/billing-store'
import type { SortField, SortDirection } from '@/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowUpDown } from 'lucide-react'

const FIELD_LABELS: Record<SortField, string> = {
  survey_id: 'Survey ID',
  surveyor_name: 'Surveyor',
  survey_date: 'Date',
  survey_time: 'Time',
}

const SORT_FIELDS: SortField[] = ['survey_id', 'surveyor_name', 'survey_date', 'survey_time']

export function SortSelector() {
  const sort = useBillingStore((s) => s.filters.sort)
  const setSortConfig = useBillingStore((s) => s.setSortConfig)

  return (
    <div className="flex items-center gap-0.5 h-8 rounded-lg border border-border bg-card px-1.5">
      <Select
        value={sort?.field || 'survey_id'}
        onValueChange={(v) => setSortConfig({ field: v as SortField, direction: sort?.direction || 'desc' })}
      >
        <SelectTrigger className="h-7 text-xs border-0 ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 px-0.5 gap-1 [&>svg]:h-3 [&>svg]:w-3">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-[9999]">
          {SORT_FIELDS.map((f) => (
            <SelectItem key={f} value={f}>{FIELD_LABELS[f]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={() => setSortConfig({
          field: sort?.field || 'survey_id',
          direction: (sort?.direction === 'asc' ? 'desc' : 'asc') as SortDirection,
        })}
        aria-label={sort?.direction === 'asc' ? 'Ascending' : 'Descending'}
      >
        <ArrowUpDown className={cn('h-3 w-3 transition-transform', sort?.direction === 'asc' && 'rotate-180')} />
      </Button>
    </div>
  )
}
