'use client'

import { useState, useMemo, useCallback } from 'react'
import { useBillingStore, CITY_CONFIG } from '@/stores/billing-store'
import { useDataInsight } from '@/hooks/use-data-insight'
import { useSurveyPayments } from '@/hooks/use-survey-data'
import { currentMonth } from '@/lib/constants'
import type { AggregationRow, DeliveryKpis, UnitRow } from '@/hooks/use-data-insight'
import type { SurveyUnit } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ChevronDown, Truck, Camera, PersonStanding, Percent } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PaginationBar } from '@/components/pagination-bar'
import { PaymentHistoryCard } from '@/components/payment-history-card'

const kpiConfig: { key: string; label: string; dot: string; accent: string }[] = [
  { key: 'total_units', label: 'Total', dot: 'bg-blue-500', accent: 'text-blue-500' },
  { key: 'active_units', label: 'Active', dot: 'bg-green-500', accent: 'text-green-500' },
  { key: 'archived_units', label: 'Archived', dot: 'bg-gray-500', accent: 'text-gray-500' },
  { key: 'billed_units', label: 'Billed', dot: 'bg-emerald-500', accent: 'text-emerald-500' },
  { key: 'paid_units', label: 'Paid', dot: 'bg-purple-500', accent: 'text-purple-500' },
  { key: 'total_collected', label: 'Collected', dot: 'bg-amber-500', accent: 'text-amber-500' },
  { key: 'unique_surveyors', label: 'Surveyors', dot: 'bg-indigo-500', accent: 'text-indigo-500' },
]

function formatNum(n: number): string {
  return n.toLocaleString()
}

function formatCurrency(n: number): string {
  return `Rs. ${n.toLocaleString()}`
}

function KpiCards({ data: d }: { data: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {kpiConfig.map((k) => {
        const value = d[k.key] ?? 0
        const display = k.key === 'total_collected' ? formatCurrency(value) : formatNum(value)
        return (
          <div key={k.key} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${k.dot}`} />
            <span className="text-[11px] text-muted-foreground truncate">{k.label}</span>
            <span className={`ml-auto text-sm font-bold ${k.accent}`}>{display}</span>
          </div>
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

function AggregationTable({ rows, level, onDrillDown }: { rows: AggregationRow[]; level: string; onDrillDown?: (ucName: string) => void }) {
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow
                  key={i}
                  className={onDrillDown ? 'cursor-pointer hover:bg-muted/50' : ''}
                  onClick={() => onDrillDown?.(row.uc_name!)}
                >
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
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={level === 'district' ? 7 : 8} className="text-center text-sm text-muted-foreground py-8">
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

function ExpandedPaymentContent({ surveyId }: { surveyId: string }) {
  const { data: billData, isLoading, isError } = useSurveyPayments(surveyId)

  if (isLoading) return <p className="text-[10px] text-muted-foreground">Loading payments...</p>
  if (isError) return <p className="text-[10px] text-red-500">Failed to load payments</p>

  return (
    <PaymentHistoryCard
      payments={billData?.payments || []}
      allMonths={billData?.allMonths}
      currentMonthTag={currentMonth()}
    />
  )
}

function UnitTable({ unitRows, onOpen }: { unitRows: UnitRow[]; onOpen: (row: UnitRow) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-semibold w-8 p-0 px-1" />
                <TableHead className="text-xs font-semibold">Survey ID</TableHead>
                <TableHead className="text-xs font-semibold max-md:hidden">PSID</TableHead>
                <TableHead className="text-xs font-semibold">Consumer</TableHead>
                <TableHead className="text-xs font-semibold max-md:hidden">Surveyor</TableHead>
                <TableHead className="text-xs font-semibold text-right max-md:hidden">Current Bill</TableHead>
                <TableHead className="text-xs font-semibold text-right max-md:hidden">
                  <span>Paid</span>
                  <span className="text-[8px] font-extrabold ml-1 text-blue-600 bg-blue-100 rounded px-0.5">Current</span>
                </TableHead>
                <TableHead className="text-xs font-semibold text-right w-20">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!unitRows.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                    No units found in this MC/UC
                  </TableCell>
                </TableRow>
              ) : unitRows.flatMap((row) => {
                const cells = (
                  <TableRow key={row.psid} className={expandedId === row.psid ? 'border-b-0' : ''}>
                    <TableCell className="w-8 p-0 pl-1">
                      <button
                        onClick={() => toggleExpand(row.psid)}
                        className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted cursor-pointer"
                        aria-label="Toggle payment history"
                      >
                        <ChevronDown
                          className={cn(
                            'h-3.5 w-3.5 text-muted-foreground transition-transform',
                            expandedId === row.psid && 'rotate-180'
                          )}
                        />
                      </button>
                    </TableCell>
                    <TableCell className="text-sm font-mono font-medium">{row.survey_id}</TableCell>
                    <TableCell className="text-sm font-mono max-md:hidden">{row.psid}</TableCell>
                    <TableCell className="text-sm truncate max-w-[120px] md:max-w-none">{row.consumer_name || '-'}</TableCell>
                    <TableCell className="text-sm max-md:hidden">{row.surveyor_name || '-'}</TableCell>
                    <TableCell className="text-sm text-right max-md:hidden">{formatCurrency((row.monthly_fee ?? 0) + (row.arrears ?? 0))}</TableCell>
                    <TableCell className="text-sm text-right max-md:hidden">{formatCurrency(row.amount_paid)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpen(row)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                )
                const expanded = expandedId === row.psid ? (
                  <TableRow key={`${row.psid}-exp`}>
                    <TableCell colSpan={8} className="bg-muted/30 p-3">
                      <ExpandedPaymentContent surveyId={row.survey_id} />
                    </TableCell>
                  </TableRow>
                ) : null
                return [cells, expanded].filter(Boolean)
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

const dkpiConfig: { key: keyof DeliveryKpis; label: string; icon: typeof Truck; accent: string; fmt?: (v: number) => string }[] = [
  { key: 'total_assigned', label: 'Assigned', icon: Truck, accent: 'text-blue-500' },
  { key: 'total_delivered', label: 'Delivered', icon: Truck, accent: 'text-green-500' },
  { key: 'delivery_rate', label: 'Rate', icon: Percent, accent: 'text-purple-500', fmt: (v) => `${v}%` },
  { key: 'total_photos', label: 'Photos', icon: Camera, accent: 'text-amber-500' },
  { key: 'staff_with_deliveries', label: 'Staff', icon: PersonStanding, accent: 'text-indigo-500' },
]

function DeliveryKpiCards({ kpis }: { kpis: DeliveryKpis }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {dkpiConfig.map((k) => {
        const value = kpis[k.key] ?? 0
        const display = k.fmt ? k.fmt(value) : value.toLocaleString()
        return (
          <div key={k.key} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
            <k.icon className={`h-3.5 w-3.5 shrink-0 ${k.accent}`} />
            <span className="text-[11px] text-muted-foreground truncate">{k.label}</span>
            <span className={`ml-auto text-sm font-bold ${k.accent}`}>{display}</span>
          </div>
        )
      })}
    </div>
  )
}

export function DataInsight() {
  const sharedFilters = useBillingStore((s) => s.filters)
  const selectedCity = useBillingStore((s) => s.selectedCity)
  const selectHouse = useBillingStore((s) => s.selectHouse)
  const [page, setPage] = useState(1)
  const [drillUC, setDrillUC] = useState<string | null>(null)

  const insightFilters = useMemo(() => {
    const cityCfg = selectedCity ? CITY_CONFIG[selectedCity] : null
    return {
      districts: cityCfg?.district ? [cityCfg.district] : sharedFilters.districts,
      tehsils: cityCfg?.tehsil ? [cityCfg.tehsil] : [],
      ucs: [],
      surveyor: null,
      paymentStatus: 'all' as const,
      unitType: null,
      search: '',
      billMonth: sharedFilters.billMonth,
    }
  }, [selectedCity, sharedFilters.billMonth, sharedFilters.districts])

  const { data, isLoading, isError, error } = useDataInsight({ filters: insightFilters, page, pageSize: 50, drillUC })
  const totalPages = Math.ceil((data?.total || 0) / 50)
  const totalRecords = data?.total || 0
  const level = data?.level || 'district'

  const handleDrillDown = useCallback((ucName: string) => {
    setDrillUC(ucName)
    setPage(1)
  }, [])

  const handleBack = useCallback(() => {
    setDrillUC(null)
    setPage(1)
  }, [])

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
              <Skeleton className="h-2.5 w-2.5 rounded-full shrink-0" />
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-4 w-10 ml-auto" />
            </div>
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
  const unitRows = data?.unitRows || []
  const rows = data?.rows || []

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-4 space-y-4">
          {kpis && <KpiCards data={kpis as Record<string, number>} />}

          {data?.delivery_kpis && (
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Delivery KPIs</h3>
              <DeliveryKpiCards kpis={data.delivery_kpis} />
            </div>
          )}

          {level === 'unit' ? (
            <>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleBack} className="h-9 gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to MC/UC View
                </Button>
                <span className="text-xs text-muted-foreground font-mono">{drillUC}</span>
              </div>
              <UnitTable
                unitRows={unitRows}
                onOpen={(row) => {
                  const items = unitRows.map(u => ({ survey_id: u.survey_id })) as SurveyUnit[]
                  selectHouse(row.survey_id, items, totalRecords)
                }}
              />
            </>
          ) : (
            <AggregationTable rows={rows} level={level} onDrillDown={level === 'uc' ? handleDrillDown : undefined} />
          )}
        </div>
      </div>

      {totalRecords > 0 && (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalRecords={totalRecords}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}
