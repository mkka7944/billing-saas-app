'use client'

import { useMemo, useState } from 'react'
import { useBillingStore } from '@/stores/billing-store'
import { useSurveyData } from '@/hooks/use-survey-data'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function SurveyList() {
  const filters = useBillingStore((s) => s.filters)
  const selectHouse = useBillingStore((s) => s.selectHouse)
  const [page, setPage] = useState(1)
  const pageSize = 50

  const { data, isLoading } = useSurveyData(filters, page, pageSize)

  const totalPages = useMemo(() => Math.ceil((data?.total || 0) / pageSize), [data?.total])

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24 hidden md:block" />
              <Skeleton className="h-4 w-16 hidden sm:block" />
              <Skeleton className="h-5 w-14 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Survey ID</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Address</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Fee</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.data || []).map((s) => (
              <TableRow
                key={s.survey_id}
                className="cursor-pointer"
                onClick={() => selectHouse(s.survey_id)}
              >
                <TableCell className="text-sm font-medium">{s.consumer_name || 'Unknown'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.survey_id}</TableCell>
                <TableCell className="text-xs text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                  {s.address || '-'}
                </TableCell>
                <TableCell className="text-xs hidden sm:table-cell">Rs. {s.monthly_fee || 0}</TableCell>
                <TableCell>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted">Active</span>
                </TableCell>
              </TableRow>
            ))}
            {!data?.data?.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
                  No survey records found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {data && (data?.total || 0) > pageSize && (
        <div className="flex items-center justify-between px-4 py-2 border-t bg-card shrink-0">
          <span className="text-xs text-muted-foreground">
            {data?.total || 0} total
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
