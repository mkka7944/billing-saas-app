'use client'

import { MapPin, FileText, List } from 'lucide-react'
import type { SearchResultUnit } from '@/types/search'

interface SearchResultsPopoverProps {
  results: SearchResultUnit[]
  isSearching: boolean
  showMapButton?: boolean
  showListButton?: boolean
  showDetailsButton?: boolean
  onViewOnMap: (result: SearchResultUnit) => void
  onViewInList?: (result: SearchResultUnit) => void
  onViewDetails?: (result: SearchResultUnit) => void
}

export default function SearchResultsPopover({
  results,
  isSearching,
  showMapButton = true,
  showListButton = false,
  showDetailsButton = true,
  onViewOnMap,
  onViewInList,
  onViewDetails,
}: SearchResultsPopoverProps) {
  if (isSearching) {
    return (
      <div className="p-3 text-xs text-muted-foreground text-center">Searching...</div>
    )
  }

  if (results.length === 0) return null

  return (
    <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
      {results.map((r) => (
        <SearchResultCard
          key={r.psid}
          result={r}
          showMapButton={showMapButton}
          showListButton={showListButton}
          showDetailsButton={showDetailsButton}
          onViewOnMap={onViewOnMap}
          onViewInList={onViewInList}
          onViewDetails={onViewDetails}
        />
      ))}
    </div>
  )
}

function SearchResultCard({
  result,
  showMapButton,
  showListButton,
  showDetailsButton,
  onViewOnMap,
  onViewInList,
  onViewDetails,
}: {
  result: SearchResultUnit
  showMapButton: boolean
  showListButton: boolean
  showDetailsButton: boolean
  onViewOnMap: (result: SearchResultUnit) => void
  onViewInList?: (result: SearchResultUnit) => void
  onViewDetails?: (result: SearchResultUnit) => void
}) {
  const hasMap = showMapButton && result.lat && result.lng

  return (
    <div className="px-3 py-2.5 hover:bg-muted/50 transition-colors">
      {/* Mobile: compact one-line */}
      <div className="flex items-center justify-between gap-2 lg:hidden">
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <span className="text-xs font-semibold truncate">{result.consumer_name || 'Unknown'}</span>
          {result.psid && (
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">{result.psid.slice(-8)}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasMap && (
            <button
              onClick={() => onViewOnMap(result)}
              className="h-7 w-7 flex items-center justify-center rounded-md bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer transition-colors"
              title="View on Map"
            >
              <MapPin className="h-3.5 w-3.5" />
            </button>
          )}
          {showListButton && (
            <button
              onClick={() => onViewInList?.(result)}
              className="h-7 w-7 flex items-center justify-center rounded-md bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 cursor-pointer transition-colors"
              title="View in List"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          )}
          {showDetailsButton && (
            <button
              onClick={() => onViewDetails?.(result)}
              className="h-7 w-7 flex items-center justify-center rounded-md bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer transition-colors"
              title="View Details"
            >
              <FileText className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Desktop: full info */}
      <div className="hidden lg:block">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate">{result.consumer_name || 'Unknown'}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {result.psid && (
                <span className="text-[10px] font-mono text-muted-foreground">PSID: {result.psid}</span>
              )}
              {result.survey_id && (
                <span className="text-[10px] font-mono text-muted-foreground">SID: {result.survey_id}</span>
              )}
              {result.uc_name && (
                <span className="text-[10px] text-muted-foreground">{result.uc_name}</span>
              )}
            </div>
            {result.address && (
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{result.address}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {hasMap && (
              <button
                onClick={() => onViewOnMap(result)}
                className="h-7 px-2 text-[10px] font-semibold rounded-md bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1 cursor-pointer transition-colors"
                title="View on Map"
              >
                <MapPin className="h-3 w-3" />
                Map
              </button>
            )}
            {showListButton && (
              <button
                onClick={() => onViewInList?.(result)}
                className="h-7 px-2 text-[10px] font-semibold rounded-md bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 flex items-center gap-1 cursor-pointer transition-colors"
                title="View in List"
              >
                <List className="h-3 w-3" />
                List
              </button>
            )}
            {showDetailsButton && (
              <button
                onClick={() => onViewDetails?.(result)}
                className="h-7 px-2 text-[10px] font-semibold rounded-md bg-muted text-muted-foreground hover:bg-muted/80 flex items-center gap-1 cursor-pointer transition-colors"
                title="View Details"
              >
                <FileText className="h-3 w-3" />
                Details
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
