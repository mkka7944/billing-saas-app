'use client'

import { useMemo } from 'react'
import { useTheme } from 'next-themes'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { TehsilBreakdownRow } from '@/types'
import { sortMonths } from '@/lib/constants'
import { ChartStatsPanel, getChartStats } from '@/components/charts/chart-stats-panel'

function formatRs(n: number) {
  return `Rs. ${n.toLocaleString()}`
}

const MONTH_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#f97316', '#84cc16', '#ec4899']

const MONTH_LABELS: Record<string, string> = {
  SEP2025: 'Sep', OCT2025: 'Oct', NOV2025: 'Nov', DEC2025: 'Dec',
  JAN2026: 'Jan', FEB2026: 'Feb', MAR2026: 'Mar', APR2026: 'Apr', MAY2026: 'May',
}

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

export function OfficeBreakdownChart({ data }: { data: TehsilBreakdownRow[] }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const gridColor = isDark ? '#374151' : '#e5e7eb'
  const textColor = isDark ? '#9ca3af' : '#6b7280'

  const { tehsils, months, chartData } = useMemo(() => {
    const tehsilSet = new Set<string>()
    const monthSet = new Set<string>()
    const map = new Map<string, Record<string, number>>()

    for (const row of data) {
      tehsilSet.add(row.tehsil)
      monthSet.add(row.bill_month)
      const existing = map.get(row.tehsil) || {}
      existing[row.bill_month] = row.amount
      map.set(row.tehsil, existing)
    }

    const sortedTehsils = Array.from(tehsilSet).sort()
    const sortedMonths = Array.from(monthSet).sort(sortMonths)
    const points = sortedTehsils.map((t) => {
      const point: Record<string, any> = { tehsil: t }
      for (const m of sortedMonths) {
        point[m] = map.get(t)?.[m] || 0
      }
      return point
    })

    return { tehsils: sortedTehsils, months: sortedMonths, chartData: points }
  }, [data])

  if (!data.length) {
    return <div className="flex items-center justify-center h-48 text-xs text-muted-foreground">No data</div>
  }

  const stats = getChartStats(data, [
    { label: 'Tehsils', value: tehsils.length.toString() },
    { label: 'Months', value: months.length.toString() },
  ])

  return (
    <div className="relative">
      <ChartStatsPanel items={stats} />
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
        <Legend
          formatter={(value: string) => (
            <span style={{ color: textColor, fontSize: 11 }}>{MONTH_LABELS[value] || value}</span>
          )}
          iconSize={8}
        />
        {months.map((m, i) => (
          <Bar key={m} dataKey={m} fill={MONTH_COLORS[i % MONTH_COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={24} />
        ))}
      </BarChart>
    </ResponsiveContainer>
    </div>
  )
}
