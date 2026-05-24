'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import { useBillingStore } from '@/stores/billing-store'
import { useSurveyData } from '@/hooks/use-survey-data'
import { shortenMCName } from '@/lib/mc-utils'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight, MapPin, Search, X } from 'lucide-react'

export function SurveyList() {
  const filters = useBillingStore((s) => s.filters)
  const selectHouse = useBillingStore((s) => s.selectHouse)
  const setMapCenter = useBillingStore((s) => s.setMapCenter)
  const setMapZoom = useBillingStore((s) => s.setMapZoom)
  const setView = useBillingStore((s) => s.setView)

  const [page, setPage] = useState(1)
  const [searchId, setSearchId] = useState('')
  const pageSize = 50

  const { data, isLoading } = useSurveyData(filters, page, pageSize)

  const totalPages = useMemo(() => Math.ceil((data?.total || 0) / pageSize), [data?.total])
  const items = data?.data || []
  const searchInputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!searchId.trim()) return items
    const q = searchId.trim().toLowerCase()
    return items.filter(
      (s) =>
        s.survey_id.toLowerCase().includes(q) ||
        s.consumer_name?.toLowerCase().includes(q)
    )
  }, [items, searchId])

  useEffect(() => {
    setPage(1)
  }, [filters])

  const showOnMap = (s: (typeof items)[0]) => {
    if (s.lat && s.lng) {
      setMapCenter([s.lat, s.lng])
      setMapZoom(18)
    }
    setView('map')
  }

  if (isLoading) {
    return (
      <div className="p-3 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border p-3 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-background shrink-0">
        <div className="flex-1 flex items-center gap-2 rounded-lg border border-border bg-background px-3 h-9">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="Search ID or name..."
            className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground/60"
          />
          {searchId && (
            <button onClick={() => { setSearchId(''); searchInputRef.current?.focus() }} className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted cursor-pointer">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground font-mono font-bold whitespace-nowrap">
          {filtered.length > 0 ? `${page} / ${totalPages}` : '0 records'}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-2">
          {filtered.map((s) => {
            const shortUc = shortenMCName(s.uc_name)
            return (
              <div
                key={s.survey_id}
                className="rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors overflow-hidden cursor-pointer active:bg-muted/70"
                onClick={() => selectHouse(s.survey_id)}
              >
                <div className="flex items-center min-h-0">
                  {s.image_urls?.[0] && (
                    <div className="w-16 h-16 shrink-0">
                      <img src={s.image_urls[0]} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    </div>
                  )}
                  <div className="flex-1 px-3 py-2.5 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate leading-tight">{s.consumer_name || 'Unknown'}</p>
                        <p className="text-xs font-mono text-muted-foreground mt-0.5">#{s.survey_id}</p>
                      </div>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 shrink-0">{shortUc}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); showOnMap(s) }}
                      className="mt-1.5 h-7 px-2 text-[10px] font-bold rounded-md border border-border hover:bg-muted flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <MapPin className="h-3 w-3" />
                      Map
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
          {!filtered.length && (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No records found</p>
              {searchId && (
                <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {data && (data?.total || 0) > 0 && (
        <div className="flex items-center justify-between px-3 py-2 border-t bg-card shrink-0">
          <span className="text-[10px] text-muted-foreground font-mono">
            {data?.total || 0} total
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[11px] font-mono font-bold text-muted-foreground min-w-[60px] text-center">
              {page} / {totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
