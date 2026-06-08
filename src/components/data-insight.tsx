'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useBillingStore, CITY_CONFIG } from '@/stores/billing-store'
import { useDataInsight } from '@/hooks/use-data-insight'
import { useSurveyPayments } from '@/hooks/use-survey-data'
import { currentMonth } from '@/lib/constants'
import type { AggregationRow, UnitRow } from '@/hooks/use-data-insight'
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
import { ArrowLeft, ChevronDown, Flag, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PaginationBar } from '@/components/pagination-bar'
import { PaymentHistoryCard } from '@/components/payment-history-card'
import { useToast } from '@/hooks/use-toast'

const kpiConfig: { key: string; label: string; dot: string; accent: string }[] = [
  { key: 'total_units', label: 'Total', dot: 'bg-blue-500 dark:bg-blue-400', accent: 'text-blue-500 dark:text-blue-300' },
  { key: 'active_units', label: 'Active', dot: 'bg-green-500 dark:bg-green-400', accent: 'text-green-500 dark:text-green-300' },
  { key: 'archived_units', label: 'Archived', dot: 'bg-gray-500 dark:bg-gray-400', accent: 'text-gray-500 dark:text-gray-300' },
  { key: 'billed_units', label: 'Billed', dot: 'bg-emerald-500 dark:bg-emerald-400', accent: 'text-emerald-500 dark:text-emerald-300' },
  { key: 'paid_units', label: 'Paid', dot: 'bg-purple-500 dark:bg-purple-400', accent: 'text-purple-500 dark:text-purple-300' },
  { key: 'total_collected', label: 'Collected', dot: 'bg-amber-500 dark:bg-amber-400', accent: 'text-amber-500 dark:text-amber-300' },
  { key: 'unique_surveyors', label: 'Surveyors', dot: 'bg-indigo-500 dark:bg-indigo-400', accent: 'text-indigo-500 dark:text-indigo-300' },
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
            <span className="text-xs text-muted-foreground truncate">{k.label}</span>
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
  if (isError) return <p className="text-[10px] text-red-500 dark:text-red-300">Failed to load payments</p>

  return (
    <PaymentHistoryCard
      payments={billData?.payments || []}
      allMonths={billData?.allMonths}
      currentMonthTag={currentMonth()}
    />
  )
}

function UnitTable({ unitRows, onOpen, showFlag }: { unitRows: UnitRow[]; onOpen: (row: UnitRow) => void; showFlag?: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [psidExpand, setPsidExpand] = useState<string | null>(null)

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  const colCount = showFlag ? 11 : 10

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-semibold">Survey ID</TableHead>
                <TableHead className="text-xs font-semibold max-md:hidden">PSID</TableHead>
                <TableHead className="text-xs font-semibold">Consumer</TableHead>
                {showFlag && (
                  <TableHead className="text-xs font-semibold">Flag</TableHead>
                )}
                <TableHead className="text-xs font-semibold max-md:hidden">Surveyor</TableHead>
                <TableHead className="text-xs font-semibold max-md:hidden">Date</TableHead>
                <TableHead className="text-xs font-semibold max-md:hidden">Time</TableHead>
                <TableHead className="text-xs font-semibold text-right max-md:hidden">Current Bill</TableHead>
                <TableHead className="text-xs font-semibold text-right max-md:hidden">
                  <span>Paid</span>
                  <span className="text-[10px] font-extrabold ml-1 text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 rounded px-0.5">Current</span>
                </TableHead>
                <TableHead className="text-xs font-semibold w-8">History</TableHead>
                <TableHead className="text-xs font-semibold text-right w-20">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!unitRows.length ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="text-center text-sm text-muted-foreground py-8">
                    No units found in this MC/UC
                  </TableCell>
                </TableRow>
              ) : unitRows.flatMap((row) => {
                const cells = (
                  <TableRow key={row.survey_id} className={cn(expandedId === row.survey_id && 'border-b-0', row.flagged_reason && 'bg-red-50 dark:bg-red-950/20')}>
                    <TableCell className="text-sm font-mono font-medium">{row.survey_id}</TableCell>
                    <TableCell className="text-sm font-mono max-md:hidden">{row.psid}</TableCell>
                    <TableCell className="text-sm truncate max-w-[120px] md:max-w-none">{row.consumer_name || '-'}</TableCell>
                    {showFlag && (
                      <TableCell>
                        {row.flagged_summary ? (() => {
                          const s = row.flagged_summary!
                          const isRed = s.action === 'DO_NOT_DELIVER'
                          const isGreen = s.action === 'DELIVER'
                          const isExpanded = psidExpand === row.survey_id
                          return (
                            <div className="flex flex-col gap-0.5">
                              <button
                                onClick={() => setPsidExpand(isExpanded ? null : row.survey_id)}
                                className={cn(
                                  'inline-flex items-center gap-1 text-[10px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap text-left cursor-pointer',
                                  isRed && 'text-red-600 dark:text-red-300 bg-red-100 dark:bg-red-900/30',
                                  isGreen && 'text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30',
                                  !isRed && !isGreen && 'text-amber-600 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30',
                                )}
                                title={row.flagged_notes || ''}
                              >
                                <Flag className="h-2.5 w-2.5 shrink-0" />
                                {s.label}
                                {s.plus_count > 1 && <span className="ml-0.5 opacity-70">+{s.plus_count - 1}</span>}
                              </button>
                              {isExpanded && s.plus_count > 1 && row.flagged_entries && (
                                <div className="mt-1 space-y-0.5 pl-1">
                                  {row.flagged_entries.filter(e => e.psid !== row.psid).map((entry, i) => (
                                    <div key={i} className="flex items-center gap-1 text-[9px] text-muted-foreground font-mono">
                                      <span className="truncate max-w-[80px]">{entry.psid}</span>
                                      <span className="shrink-0 italic">
                                        {entry.reason === 'psid_duplicate_orphan' ? '— never paid' :
                                         entry.reason === 'psid_duplicate_superseded' ? '— superseded' :
                                         entry.notes ? entry.notes : ''}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })() : (
                          <span className="text-[10px] text-muted-foreground italic">Archived</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-sm max-md:hidden">{row.surveyor_name || '-'}</TableCell>
                    <TableCell className="text-sm max-md:hidden">{row.survey_date ? new Date(row.survey_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</TableCell>
                    <TableCell className="text-sm max-md:hidden">{row.survey_time || '-'}</TableCell>
                    <TableCell className="text-sm text-right max-md:hidden">{formatCurrency((row.monthly_fee ?? 0) + (row.arrears ?? 0))}</TableCell>
                    <TableCell className="text-sm text-right max-md:hidden">{formatCurrency(row.amount_paid)}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => toggleExpand(row.survey_id)} aria-label="Toggle payment history">
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expandedId === row.survey_id && 'rotate-180')} />
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpen(row)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                )
                const expanded = expandedId === row.survey_id ? (
                  <TableRow key={`${row.survey_id}-exp`}>
                    <TableCell colSpan={colCount} className="bg-muted/30 p-3">
                      <div className="ml-auto w-fit max-w-[220px]">
                        <ExpandedPaymentContent surveyId={row.survey_id} />
                      </div>
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

export function DataInsight() {
  const sharedFilters = useBillingStore((s) => s.filters)
  const selectedCity = useBillingStore((s) => s.selectedCity)
  const selectHouse = useBillingStore((s) => s.selectHouse)
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [page, setPage] = useState(1)
  const [drillUC, setDrillUC] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'duplicates'>('active')
  const [refreshing, setRefreshing] = useState(false)

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
      sort: sharedFilters.sort,
    }
  }, [selectedCity, sharedFilters.billMonth, sharedFilters.districts, sharedFilters.sort])

  const { data, isLoading, isError, error } = useDataInsight({ filters: insightFilters, page, pageSize: 50, drillUC, status: statusFilter })
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
          <p className="text-sm text-red-500 dark:text-red-300 font-semibold">Failed to load data</p>
          <p className="text-xs text-muted-foreground">{(error as Error)?.message || 'Unknown error'}</p>
        </div>
      </div>
    )
  }

  const kpis = data?.kpis
  const unitRows = data?.unitRows || []
  const rows = (data?.rows || []).filter(r => r.total_units > 0)

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-4 space-y-4">
          {kpis && <KpiCards data={kpis as Record<string, number>} />}

          <div className="flex items-center gap-2 flex-wrap">
            {level === 'unit' && (
              <>
                <Button variant="outline" size="sm" onClick={handleBack} className="h-9 gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </Button>
                <span className="text-xs text-muted-foreground font-mono">{drillUC}</span>
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 w-fit">
            <button
              onClick={() => { setStatusFilter('active'); setPage(1) }}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${statusFilter === 'active' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Active
            </button>
            <button
              onClick={() => { setStatusFilter('archived'); setPage(1) }}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${statusFilter === 'archived' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Archived
            </button>
            {level === 'unit' && (
              <button
                onClick={() => { setStatusFilter('duplicates'); setPage(1) }}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${statusFilter === 'duplicates' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Duplicates
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (refreshing) return
              setRefreshing(true)
              try {
                const res = await fetch('/api/data-insight/refresh', { method: 'POST' })
                if (res.ok) {
                  queryClient.invalidateQueries({ queryKey: ['data-insight'] })
                  toast('Cache refreshed', 'success')
                } else {
                  const err = await res.json().catch(() => ({ error: 'Unknown error' }))
                  toast(err.error || 'Refresh failed', 'error')
                }
              } finally {
                setRefreshing(false)
              }
            }}
            disabled={refreshing}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Cache'}
          </Button>
        </div>

        {level === 'unit' ? (
            <>
              <UnitTable
                unitRows={unitRows}
                onOpen={(row) => {
                  const items = unitRows as unknown as SurveyUnit[]
                  selectHouse(row.survey_id, items, totalRecords)
                }}
                showFlag={statusFilter !== 'active'}
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
