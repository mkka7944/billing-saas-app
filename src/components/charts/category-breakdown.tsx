'use client'

import { useTheme } from 'next-themes'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from 'recharts'
import type { CategorySummaryRow } from '@/types'
import { ChartStatsPanel, getChartStats } from '@/components/charts/chart-stats-panel'

const CATEGORY_COLORS: Record<string, string> = {
  'Domestic Urban': '#3b82f6',
  'Domestic Rural': '#10b981',
  'Commercial Urban': '#8b5cf6',
  'Commercial Rural': '#f59e0b',
  'Other': '#6b7280',
}

function formatRs(n: number) {
  return `Rs. ${n.toLocaleString()}`
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as CategorySummaryRow
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-bold mb-1">{row.category_group}</p>
      <p className="text-muted-foreground">Collected: <span className="font-semibold text-foreground">{formatRs(row.amount)}</span></p>
      <p className="text-muted-foreground">Bills: <span className="font-semibold text-foreground">{row.bills.toLocaleString()}</span></p>
    </div>
  )
}

export function CategoryBreakdownChart({ data, title }: { data: CategorySummaryRow[]; title?: string }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const textColor = isDark ? '#9ca3af' : '#6b7280'

  if (!data.length) {
    return <div className="flex items-center justify-center h-48 text-xs text-muted-foreground">No data</div>
  }

  const stats = getChartStats(data, [{ label: 'Categories', value: data.length.toString() }])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-1 mb-3">
        {title && <h3 className="text-sm font-semibold">{title}</h3>}
        <ChartStatsPanel items={stats} />
      </div>
      <ResponsiveContainer width="100%" height={230}>
      <PieChart>
        <Pie
          data={data}
          dataKey="amount"
          nameKey="category_group"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((row) => (
            <Cell key={row.category_group} fill={CATEGORY_COLORS[row.category_group] || '#6b7280'} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value: string) => (
            <span style={{ color: textColor, fontSize: 11 }}>{value}</span>
          )}
          iconSize={8}
        />
      </PieChart>
    </ResponsiveContainer>
    </div>
  )
}
