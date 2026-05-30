'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PaginationBarProps {
  page: number
  totalPages: number
  totalRecords: number
  onPageChange: (page: number) => void
  centerInfo?: string
}

export function PaginationBar({ page, totalPages, totalRecords, onPageChange, centerInfo }: PaginationBarProps) {
  return (
    <div className="border-t bg-card">
      <div className="flex items-center justify-between px-3 py-2 max-w-3xl mx-auto">
        {/* Left buttons */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            className="h-11 w-11"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
            aria-label="First page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            className="h-11 w-11"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* Center info */}
        <div className="text-center min-w-0 px-2">
          <p className="text-xs font-medium text-foreground truncate">
            {centerInfo || `${totalRecords.toLocaleString()} records`}
          </p>
          {totalPages > 0 && (
            <p className="text-[10px] text-muted-foreground font-mono">
              Page {page} / {totalPages}
            </p>
          )}
        </div>

        {/* Right buttons */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            className="h-11 w-11"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            className="h-11 w-11"
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
            aria-label="Last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
