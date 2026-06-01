'use client'

import { useTheme } from 'next-themes'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts'
import type { MonthlyTrendRow } from '@/types'
import { ChartStatsPanel, getChartStats } from '@/components/charts/chart-stats-panel'

function formatRs(n: number) {
  return `Rs. ${n.toLocaleString()}`
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as MonthlyTrendRow
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-bold mb-1">{label}</p>
      <p className="text-muted-foreground">Collected: <span className="font-semibold text-foreground">{formatRs(row.amount)}</span></p>
      <p className="text-muted-foreground">Bills: <span className="font-semibold text-foreground">{row.bills.toLocaleString()}</span></p>
      <p className="text-muted-foreground">Fines: <span className="font-semibold text-foreground">{formatRs(row.fine_total)}</span></p>
    </div>
  )
}

const MONTH_COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4',
  '#f97316', '#84cc16', '#ec4899',
]

export function MonthlyTrendChart({ data, title }: { data: MonthlyTrendRow[]; title?: string }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const gridColor = isDark ? '#374151' : '#e5e7eb'
  const textColor = isDark ? '#9ca3af' : '#6b7280'

  if (!data.length) {
    return <div className="flex items-center justify-center h-48 text-xs text-muted-foreground">No data</div>
  }

  const stats = getChartStats(data, [{ label: 'Months', value: data.length.toString() }])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-1 mb-3">
        {title && <h3 className="text-sm font-semibold">{title}</h3>}
        <ChartStatsPanel items={stats} />
      </div>
      <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis
          dataKey="bill_month"
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
          formatter={(value: string) => <span style={{ color: textColor, fontSize: 10 }}>{value}</span>}
          iconSize={8}
        />
        <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((_, i) => (
            <Cell key={i} fill={MONTH_COLORS[i % MONTH_COLORS.length]} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
  )
}
