'use client'

import { useState, useCallback } from 'react'
import { useBillingStore } from '@/stores/billing-store'
import { useDataInsight } from '@/hooks/use-data-insight'
import type { AggregationRow, DeliveryKpis } from '@/hooks/use-data-insight'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Truck, Camera, PersonStanding, Percent } from 'lucide-react'

const kpiConfig: { key: string; label: string; color: string; bg: string }[] = [
  { key: 'total_units', label: 'Total Units', color: 'text-blue-600', bg: 'bg-blue-100' },
  { key: 'active_units', label: 'Active', color: 'text-green-600', bg: 'bg-green-100' },
  { key: 'archived_units', label: 'Archived', color: 'text-gray-600', bg: 'bg-gray-100' },
  { key: 'billed_units', label: 'Billed', color: 'text-emerald-600', bg: 'bg-emerald-100' },
  { key: 'paid_units', label: 'Paid', color: 'text-purple-600', bg: 'bg-purple-100' },
  { key: 'total_collected', label: 'Collected', color: 'text-amber-600', bg: 'bg-amber-100' },
  { key: 'unique_surveyors', label: 'Surveyors', color: 'text-indigo-600', bg: 'bg-indigo-100' },
  { key: 'no_coords', label: 'No Coords', color: 'text-orange-600', bg: 'bg-orange-100' },
]

function formatNum(n: number): string {
  return n.toLocaleString()
}

function formatCurrency(n: number): string {
  return `Rs. ${n.toLocaleString()}`
}

function KpiCards({ data: d }: { data: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {kpiConfig.map((k) => {
        const value = d[k.key] ?? 0
        const display = k.key === 'total_collected' ? formatCurrency(value) : formatNum(value)
        return (
          <Card key={k.key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs text-muted-foreground font-medium">{k.label}</CardTitle>
              <div className={`p-1.5 rounded ${k.bg}`}>
                <span className={`text-xs font-bold ${k.color} px-0.5`}>{display}</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">{display}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

const levelLabel: Record<string, string> = {
  district: 'District',
  tehsil: 'Tehsil',
  uc: 'MC/UC',
  unit: 'Survey ID',
}

function AggregationTable({ rows, level }: { rows: AggregationRow[]; level: string }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-semibold">{levelLabel[level] || 'Name'}</TableHead>
                {level !== 'district' && (
                  <TableHead className="text-xs font-semibold">Tehsil</TableHead>
                )}
                <TableHead className="text-xs font-semibold text-right">Units</TableHead>
                <TableHead className="text-xs font-semibold text-right">Active</TableHead>
                <TableHead className="text-xs font-semibold text-right">Billed</TableHead>
                <TableHead className="text-xs font-semibold text-right">Paid</TableHead>
                <TableHead className="text-xs font-semibold text-right">Collected</TableHead>
                <TableHead className="text-xs font-semibold text-right">Surveyors</TableHead>
                <TableHead className="text-xs font-semibold text-right">No Coords</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm font-medium">
                    {level === 'uc' ? row.uc_name : level === 'tehsil' ? row.tehsil : row.district}
                  </TableCell>
                  {level !== 'district' && (
                    <TableCell className="text-sm text-muted-foreground">{row.tehsil}</TableCell>
                  )}
                  <TableCell className="text-sm text-right">{formatNum(row.total_units)}</TableCell>
                  <TableCell className="text-sm text-right">{formatNum(row.active)}</TableCell>
                  <TableCell className="text-sm text-right">{formatNum(row.billed)}</TableCell>
                  <TableCell className="text-sm text-right">{formatNum(row.paid)}</TableCell>
                  <TableCell className="text-sm text-right">{formatCurrency(row.collected)}</TableCell>
                  <TableCell className="text-sm text-right">{formatNum(row.surveyors)}</TableCell>
                  <TableCell className="text-sm text-right">{formatNum(row.no_coords)}</TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={level === 'district' ? 8 : 9} className="text-center text-sm text-muted-foreground py-8">
                    No data matching the current filters
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

const dkpiConfig: { key: keyof DeliveryKpis; label: string; icon: typeof Truck; color: string; bg: string; fmt?: (v: number) => string }[] = [
  { key: 'total_assigned', label: 'Assigned', icon: Truck, color: 'text-blue-600', bg: 'bg-blue-100' },
  { key: 'total_delivered', label: 'Delivered', icon: Truck, color: 'text-green-600', bg: 'bg-green-100' },
  { key: 'delivery_rate', label: 'Delivery Rate', icon: Percent, color: 'text-purple-600', bg: 'bg-purple-100', fmt: (v) => `${v}%` },
  { key: 'total_photos', label: 'Photos', icon: Camera, color: 'text-amber-600', bg: 'bg-amber-100' },
  { key: 'staff_with_deliveries', label: 'Active Staff', icon: PersonStanding, color: 'text-indigo-600', bg: 'bg-indigo-100' },
]

function DeliveryKpiCards({ kpis }: { kpis: DeliveryKpis }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {dkpiConfig.map((k) => {
        const value = kpis[k.key] ?? 0
        const display = k.fmt ? k.fmt(value) : value.toLocaleString()
        return (
          <Card key={k.key} className="shadow-none">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs text-muted-foreground font-medium">{k.label}</CardTitle>
              <div className={`p-1.5 rounded ${k.bg}`}>
                <k.icon className={`h-3.5 w-3.5 ${k.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold">{display}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export function DataInsight() {
  const filters = useBillingStore((s) => s.filters)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const { data, isLoading, isError, error } = useDataInsight({ filters, page, pageSize })
  const totalPages = Math.ceil((data?.total || 0) / pageSize)

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size)
    setPage(1)
  }, [])

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 overflow-y-auto h-full">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-3 w-16" /></CardHeader>
              <CardContent><Skeleton className="h-6 w-20" /></CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-4 flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-sm text-red-500 font-semibold">Failed to load data</p>
          <p className="text-xs text-muted-foreground">{(error as Error)?.message || 'Unknown error'}</p>
        </div>
      </div>
    )
  }

  const kpis = data?.kpis
  const rows = data?.rows || []
  const level = rows[0]?.level || 'district'

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {kpis && <KpiCards data={kpis as Record<string, number>} />}

      {data?.delivery_kpis && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Delivery KPIs</h3>
          <DeliveryKpiCards kpis={data.delivery_kpis} />
        </div>
      )}

      <AggregationTable rows={rows} level={level} />

      {data && data.total > pageSize && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Rows:</span>
            {[10, 25, 50, 100].map((size) => (
              <button
                key={size}
                onClick={() => handlePageSizeChange(size)}
                className={`px-2 py-0.5 rounded text-xs font-medium cursor-pointer ${
                  pageSize === size
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span>Page {page} of {totalPages}</span>
            <Button
              variant="ghost"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
