'use client'

import { useMemo, useState, useEffect } from 'react'
import { useBillingStore } from '@/stores/billing-store'
import { useSurveyData } from '@/hooks/use-survey-data'
import { shortenMCName } from '@/lib/mc-utils'
import { Skeleton } from '@/components/ui/skeleton'
import { PaginationBar } from '@/components/pagination-bar'
import { MapPin } from 'lucide-react'

export function SurveyList() {
  const filters = useBillingStore((s) => s.filters)
  const selectedCity = useBillingStore((s) => s.selectedCity)
  const selectHouse = useBillingStore((s) => s.selectHouse)
  const setMapCenter = useBillingStore((s) => s.setMapCenter)
  const setMapZoom = useBillingStore((s) => s.setMapZoom)
  const setView = useBillingStore((s) => s.setView)
  const selectedHouseId = useBillingStore((s) => s.selectedHouseId)
  const activeView = useBillingStore((s) => s.activeView)

  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data, isLoading } = useSurveyData(filters, page, pageSize)

  const totalPages = useMemo(() => Math.ceil((data?.total || 0) / pageSize), [data?.total])
  const items = data?.data || []

  useEffect(() => {
    setPage(1)
  }, [filters])

  // Auto-select first item when entering list view (desktop HDS default-open behavior)
  useEffect(() => {
    if (activeView !== 'list') return
    if (!items.length) return
    const inPage = items.some((i) => i.survey_id === selectedHouseId)
    if (selectedHouseId && inPage) return
    selectHouse(items[0].survey_id, items, data?.total)
  }, [items, data?.total, activeView]) // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="absolute inset-0 flex flex-col">
      {/* Cards */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-3 space-y-2">
          {items.map((s) => {
            const shortUc = shortenMCName(s.uc_name)
            return (
              <div
                key={s.survey_id}
                className="rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors overflow-hidden cursor-pointer active:bg-muted/70"
                onClick={() => selectHouse(s.survey_id, items, data?.total)}
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
                        <p className="text-sm font-bold truncate leading-tight">#{s.survey_id}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.consumer_name || 'Unknown'}</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); showOnMap(s) }}
                          className="mt-1.5 h-7 px-2 text-[10px] font-bold rounded-md border border-border hover:bg-muted flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <MapPin className="h-3 w-3" />
                          Map
                        </button>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{shortUc}</span>
                        <div className="text-right text-[10px] text-muted-foreground leading-tight">
                          {s.surveyor_name && <div>{s.surveyor_name}</div>}
                          {s.survey_date && (
                            <div>{new Date(s.survey_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {!items.length && (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No records found</p>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      <PaginationBar
        page={page}
        totalPages={totalPages}
        totalRecords={data?.total || 0}
        onPageChange={setPage}
        centerInfo={(() => {
          if (filters.ucs.length) return `${filters.ucs[0]}${filters.ucs.length > 1 ? ` +${filters.ucs.length - 1}` : ''} · ${(data?.total || 0).toLocaleString()} records`
          return `${selectedCity || ''} · ${(data?.total || 0).toLocaleString()} records`
        })()}
      />
    </div>
  )
}
