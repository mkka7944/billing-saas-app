'use client'

import { useMemo, useState, Fragment } from 'react'
import { useTheme } from 'next-themes'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { TehsilBreakdownRow } from '@/types'
import { sortMonths, currentMonth } from '@/lib/constants'
import { ChartStatsPanel, getChartStats } from '@/components/charts/chart-stats-panel'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table'
import { cn } from '@/lib/utils'

function formatRs(n: number) {
  return `Rs. ${n.toLocaleString()}`
}

function formatNum(n: number) {
  return n.toLocaleString()
}

const MONTH_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#f97316', '#84cc16', '#ec4899']

const MONTH_LABELS: Record<string, string> = {
  SEP2025: 'Sep 2025', OCT2025: 'Oct 2025', NOV2025: 'Nov 2025', DEC2025: 'Dec 2025',
  JAN2026: 'Jan 2026', FEB2026: 'Feb 2026', MAR2026: 'Mar 2026', APR2026: 'Apr 2026', MAY2026: 'May 2026',
  JUN2026: 'Jun 2026',
}

const ALL_TEHSILS = ['BHALWAL', 'KHUSHAB', 'SARGODHA']

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s: number, e: any) => s + (e.value || 0), 0)
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md min-w-[160px]">
      <p className="font-bold mb-1.5">{label}</p>
      <div className="space-y-0.5">
        {payload.map((entry: any) => (
          <p key={entry.name} className="text-muted-foreground flex justify-between gap-3" style={{ color: entry.color }}>
            <span>{MONTH_LABELS[entry.name] || entry.name}:</span>
            <span className="font-semibold text-foreground tabular-nums">{formatRs(entry.value)}</span>
          </p>
        ))}
      </div>
      <div className="border-t mt-1.5 pt-1 flex justify-between gap-3 text-foreground font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatRs(total)}</span>
      </div>
    </div>
  )
}

export function OfficeBreakdownChart({ data, title }: { data: TehsilBreakdownRow[]; title?: string }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const gridColor = isDark ? '#374151' : '#e5e7eb'
  const textColor = isDark ? '#9ca3af' : '#6b7280'

  const [selectedTehsils, setSelectedTehsils] = useState<string[]>([...ALL_TEHSILS])

  const { months, chartData, monthAmounts, monthBills } = useMemo(() => {
    const monthSet = new Set<string>()
    const aMap = new Map<string, Record<string, number>>()
    const bMap = new Map<string, Record<string, number>>()

    for (const row of data) {
      monthSet.add(row.bill_month)
      if (!aMap.has(row.bill_month)) aMap.set(row.bill_month, {})
      if (!bMap.has(row.bill_month)) bMap.set(row.bill_month, {})
      aMap.get(row.bill_month)![row.tehsil] = (aMap.get(row.bill_month)![row.tehsil] || 0) + row.amount
      bMap.get(row.bill_month)![row.tehsil] = (bMap.get(row.bill_month)![row.tehsil] || 0) + row.bills
    }

    const sortedMonths = Array.from(monthSet).sort(sortMonths)
    const filtered = ALL_TEHSILS.filter(t => selectedTehsils.includes(t))
    const points = filtered.map((t) => {
      const point: Record<string, any> = { tehsil: t }
      for (const m of sortedMonths) {
        point[m] = aMap.get(m)?.[t] || 0
      }
      return point
    })

    return { months: sortedMonths, chartData: points, monthAmounts: aMap, monthBills: bMap }
  }, [data, selectedTehsils])

  const stats = getChartStats(data, [
    { label: 'Cities', value: selectedTehsils.length.toString() },
    { label: 'Months', value: months.length.toString() },
  ])

  const allSelected = selectedTehsils.length === ALL_TEHSILS.length

  const toggleAll = () => {
    setSelectedTehsils(allSelected ? [] : [...ALL_TEHSILS])
  }
  const toggleTehsil = (tehsil: string) => {
    setSelectedTehsils((prev) =>
      prev.includes(tehsil) ? prev.filter((t) => t !== tehsil) : [...prev, tehsil]
    )
  }

  const sortedTehsils = ALL_TEHSILS.filter(t => selectedTehsils.includes(t))

  const hasData = data.length > 0 && chartData.length > 0
  const activeMonth = currentMonth()

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-1 mb-3">
        {title && <h3 className="text-sm font-semibold">{title}</h3>}
        <ChartStatsPanel items={stats} />
      </div>

      <div className="flex flex-wrap rounded-lg border bg-card/90 backdrop-blur-sm text-xs shadow-sm mb-3">
        <button
          onClick={toggleAll}
          className={cn(
            'px-3 py-2 transition-colors cursor-pointer shrink-0',
            allSelected
              ? 'bg-accent text-accent-foreground font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          All Cities
        </button>
        {ALL_TEHSILS.map((t) => {
          const checked = selectedTehsils.includes(t)
          return (
            <button
              key={t}
              onClick={() => toggleTehsil(t)}
              className={cn(
                'px-3 py-2 transition-colors cursor-pointer shrink-0 border-l border-border/50',
                checked
                  ? 'bg-accent text-accent-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t}
            </button>
          )
        })}
      </div>

      {hasData && (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="tehsil"
                tick={{ fontSize: 10, fill: textColor }}
                tickLine={false}
                axisLine={{ stroke: gridColor }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: textColor }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => v >= 10000000 ? `${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v.toLocaleString()}
              />
              <Tooltip content={<CustomTooltip />} />
              {months.map((m, i) => (
                <Bar key={m} dataKey={m} fill={MONTH_COLORS[i % MONTH_COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={40} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
            {months.map((m, i) => (
              <span key={m} className="inline-flex items-center gap-1.5 text-xs" style={{ color: MONTH_COLORS[i % MONTH_COLORS.length] }}>
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: MONTH_COLORS[i % MONTH_COLORS.length] }} />
                {MONTH_LABELS[m] || m}
              </span>
            ))}
          </div>

          <div className="mt-4 w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead rowSpan={2} className="sticky left-0 bg-card z-10">City</TableHead>
                  {months.map((m) => (
                    <TableHead key={m} colSpan={2} className={cn('text-center border-r border-border/50', m === activeMonth && 'bg-primary/[0.08]')}>{MONTH_LABELS[m] || m}</TableHead>
                  ))}
                  <TableHead colSpan={2} className="text-center font-bold bg-muted/30">Total</TableHead>
                </TableRow>
                <TableRow>
                  {months.map((m) => (
                    <Fragment key={m}>
                      <TableHead className={cn('text-right text-muted-foreground font-medium', m === activeMonth && 'bg-primary/[0.08]')}>Bills</TableHead>
                      <TableHead className={cn('text-right text-muted-foreground font-medium border-r border-border/50', m === activeMonth && 'bg-primary/[0.08]')}>Amount</TableHead>
                    </Fragment>
                  ))}
                  <TableHead className="text-right font-bold bg-muted/30">Bills</TableHead>
                  <TableHead className="text-right font-bold bg-muted/30">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTehsils.map((t) => {
                  const colBills = months.reduce((s, m) => s + ((monthBills.get(m) || {})[t] || 0), 0)
                  const colAmount = months.reduce((s, m) => s + ((monthAmounts.get(m) || {})[t] || 0), 0)
                  return (
                    <TableRow key={t}>
                      <TableCell className="sticky left-0 bg-card z-10 font-medium">{t}</TableCell>
                      {months.map((m) => (
                        <Fragment key={m}>
                          <TableCell className={cn('text-right tabular-nums text-[11px]', m === activeMonth && 'bg-primary/[0.08]')}>{(monthBills.get(m) || {})[t] || 0}</TableCell>
                          <TableCell className={cn('text-right tabular-nums font-bold border-r border-border/50', m === activeMonth && 'bg-primary/[0.08]')}>{formatRs((monthAmounts.get(m) || {})[t] || 0)}</TableCell>
                        </Fragment>
                      ))}
                      <TableCell className="text-right tabular-nums font-semibold bg-muted/30">{formatNum(colBills)}</TableCell>
                      <TableCell className="text-right tabular-nums font-bold bg-muted/30">{formatRs(colAmount)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="sticky left-0 bg-primary/[0.08] z-10 font-bold">Total</TableCell>
                  {months.map((m) => {
                    const aMap = monthAmounts.get(m) || {}
                    const bMap = monthBills.get(m) || {}
                    const monthTotalBills = sortedTehsils.reduce((s, t) => s + (bMap[t] || 0), 0)
                    const monthTotalAmount = sortedTehsils.reduce((s, t) => s + (aMap[t] || 0), 0)
                    return (
                      <Fragment key={m}>
                        <TableCell className={cn('text-right tabular-nums font-semibold bg-primary/[0.08]', m === activeMonth && 'bg-primary/[0.12]')}>{formatNum(monthTotalBills)}</TableCell>
                        <TableCell className={cn('text-right tabular-nums font-bold border-r border-border/50 bg-primary/[0.08]', m === activeMonth && 'bg-primary/[0.12]')}>{formatRs(monthTotalAmount)}</TableCell>
                      </Fragment>
                    )
                  })}
                  {(() => {
                    const grandBills = sortedTehsils.reduce((s, t) =>
                      s + months.reduce((sm, m) => sm + ((monthBills.get(m) || {})[t] || 0), 0), 0)
                    const grandAmount = sortedTehsils.reduce((s, t) =>
                      s + months.reduce((sm, m) => sm + ((monthAmounts.get(m) || {})[t] || 0), 0), 0)
                    return (
                      <Fragment>
                        <TableCell className="text-right tabular-nums font-bold bg-primary/[0.08]">{formatNum(grandBills)}</TableCell>
                        <TableCell className="text-right tabular-nums font-bold bg-primary/[0.08]">{formatRs(grandAmount)}</TableCell>
                      </Fragment>
                    )
                  })()}
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </>
      )}

      {!hasData && (
        <div className="flex items-center justify-center h-48 text-xs text-muted-foreground">No data</div>
      )}
    </div>
  )
}