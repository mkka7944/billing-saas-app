'use client'

import { useState, useMemo, useEffect } from 'react'
import { useUCStats } from '@/hooks/use-uc-stats'
import { useBillingStore } from '@/stores/billing-store'
import { Search } from 'lucide-react'
import { UCListPanel } from './uc-list-panel'
import { UCDetailPanel } from './uc-detail-panel'

export function CreateAssignmentTab() {
  const selectedCity = useBillingStore((s) => s.selectedCity)
  const month = useBillingStore((s) => s.filters.billMonth)
  const { data: ucStats } = useUCStats(selectedCity, month)
  const [selectedUc, setSelectedUc] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Reset UC selection when city changes
  useEffect(() => { setSelectedUc(null); setSearch('') }, [selectedCity])

  const totalUnassigned = useMemo(
    () => (ucStats || []).reduce((s, u) => s + (u.total_units - u.assigned_today), 0),
    [ucStats]
  )

  return (
    <div className="flex gap-0 h-full">
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-neutral-200 dark:border-neutral-700">
        <div className="p-2 border-b border-neutral-100 dark:border-neutral-800">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter UCs..."
              className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-neutral-200 dark:border-neutral-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <UCListPanel ucStats={ucStats || []} selectedUc={selectedUc} onSelect={setSelectedUc} search={search} />
        </div>
        <div className="px-3 py-2 text-[10px] text-neutral-400 border-t border-neutral-100 dark:border-neutral-800">
          {(ucStats || []).length} UCs &middot; {totalUnassigned.toLocaleString()} unassigned
        </div>
      </div>
      <div className="flex-1 flex flex-col p-4 overflow-y-auto">
        {selectedUc ? (
          <UCDetailPanel
            key={selectedUc}
            uc={selectedUc}
            city={selectedCity}
            onCreated={() => {
              setSelectedUc(null)
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-neutral-400">
            Select a UC from the sidebar
          </div>
        )}
      </div>
    </div>
  )
}
