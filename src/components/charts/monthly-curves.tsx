'use client'

import { useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush,
} from 'recharts'
import type { MonthlyCurveRow } from '@/types'
import { sortMonths } from '@/lib/constants'
import { ChartStatsPanel } from '@/components/charts/chart-stats-panel'

function formatRs(n: number) {
  return `Rs. ${n.toLocaleString()}`
}

const LINE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4']
const MONTH_LABELS: Record<string, string> = {
  SEP2025: 'Sep 2025', OCT2025: 'Oct 2025', NOV2025: 'Nov 2025', DEC2025: 'Dec 2025',
  JAN2026: 'Jan 2026', FEB2026: 'Feb 2026', MAR2026: 'Mar 2026', APR2026: 'Apr 2026', MAY2026: 'May 2026',
}

function CustomTooltip({ active, payload, label, dailyMap }: any) {
  if (!active || !payload?.length) return null
  const day = Number(label)
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-bold mb-1.5 tabular-nums">{cycleTick(day)}</p>
      <table className="w-full">
        <thead>
          <tr className="text-[10px] text-muted-foreground border-b">
            <th className="text-left pr-4 pb-1 font-medium">Month</th>
            <th className="text-right pb-1 font-medium">Day Collection</th>
          </tr>
        </thead>
        <tbody>
          {payload.map((entry: any) => {
            const daily = dailyMap?.get(day)?.[entry.name] ?? 0
            return (
              <tr key={entry.name} className="border-b border-border/30 last:border-0">
                <td className="pr-4 py-1" style={{ color: entry.color }}>
                  {MONTH_LABELS[entry.name] || entry.name}
                </td>
                <td className="text-right py-1 font-semibold text-foreground">{formatRs(daily)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function cycleTick(d: number) {
  return d <= 16 ? String(d + 15) : String(d - 16)
}

export function MonthlyCurvesChart({ data, title }: { data: MonthlyCurveRow[]; title?: string }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const gridColor = isDark ? '#374151' : '#e5e7eb'
  const textColor = isDark ? '#9ca3af' : '#6b7280'

  const { months, chartData, dailyMap } = useMemo(() => {
    const monthSet = new Set<string>()
    const cumMap = new Map<number, Record<string, number>>()
    const dMap = new Map<number, Record<string, number>>()

    for (const row of data) {
      monthSet.add(row.bill_month)
      const a = cumMap.get(row.day) || {}
      a[row.bill_month] = row.cumulative_amount
      cumMap.set(row.day, a)
      const b = dMap.get(row.day) || {}
      b[row.bill_month] = row.daily_amount
      dMap.set(row.day, b)
    }

    const sortedMonths = Array.from(monthSet).sort(sortMonths)
    const points: Record<string, any>[] = []
    for (let d = 1; d <= 31; d++) {
      const point: Record<string, any> = { day: d }
      for (const m of sortedMonths) {
        point[m] = cumMap.get(d)?.[m] ?? null
      }
      points.push(point)
    }

    return { months: sortedMonths, chartData: points, dailyMap: dMap }
  }, [data])

  const [hidden, setHidden] = useState<Set<string>>(new Set())

  if (!data.length) {
    return <div className="flex items-center justify-center h-48 text-xs text-muted-foreground">No cumulative data</div>
  }

  const perMonthTotal = new Map<string, number>()
  for (const r of data) {
    perMonthTotal.set(r.bill_month, r.cumulative_amount)
  }
  const totalCollected = Array.from(perMonthTotal.values()).reduce((s, v) => s + v, 0)
  const curveStats = [
    { label: 'Total Collected', value: `Rs. ${totalCollected.toLocaleString()}` },
    { label: 'Months', value: months.length.toString() },
  ]

  const handleLegendClick = (entry: any) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(entry.value)) next.delete(entry.value)
      else next.add(entry.value)
      return next
    })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-1 mb-3">
        {title && <h3 className="text-sm font-semibold">{title}</h3>}
        <ChartStatsPanel items={curveStats} />
      </div>
      <ResponsiveContainer width="100%" height={340}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis
          dataKey="day"
          tickFormatter={cycleTick}
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
        <Tooltip content={<CustomTooltip dailyMap={dailyMap} />} />
        {months.map((m, i) => (
          <Line
            key={m}
            type="monotone"
            dataKey={m}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls={false}
            hide={hidden.has(m)}
          />
        ))}
        <Brush dataKey="day" height={28} stroke="#3b82f6" fill={isDark ? '#1e293b' : '#f8fafc'} />
      </LineChart>
    </ResponsiveContainer>
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
      {months.map((m, i) => {
        const isHidden = hidden.has(m)
        return (
          <span
            key={m}
            onClick={() => handleLegendClick({ value: m })}
            className="inline-flex items-center gap-1.5 cursor-pointer text-xs"
            style={{
              color: isHidden ? textColor : LINE_COLORS[i % LINE_COLORS.length],
              textDecoration: isHidden ? 'line-through' : 'none',
            }}
          >
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: isHidden ? textColor : LINE_COLORS[i % LINE_COLORS.length] }} />
            {MONTH_LABELS[m] || m}
          </span>
        )
      })}
    </div>
    </div>
  )
}