'use client'

import { useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { MonthlyCurveRow } from '@/types'

const MONTH_ORDER = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
function sortMonths(a: string, b: string) {
  const ya = parseInt(a.slice(3)), yb = parseInt(b.slice(3))
  if (ya !== yb) return ya - yb
  return MONTH_ORDER.indexOf(a.slice(0,3)) - MONTH_ORDER.indexOf(b.slice(0,3))
}

function formatRs(n: number) {
  return `Rs. ${n.toLocaleString()}`
}

const LINE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4']
const MONTH_LABELS: Record<string, string> = {
  SEP2025: 'Sep 2025', OCT2025: 'Oct 2025', NOV2025: 'Nov 2025', DEC2025: 'Dec 2025',
  JAN2026: 'Jan 2026', FEB2026: 'Feb 2026', MAR2026: 'Mar 2026', APR2026: 'Apr 2026', MAY2026: 'May 2026',
}

function CustomTooltip({ active, payload, label, dailyMap, labelMap }: any) {
  if (!active || !payload?.length) return null
  const day = Number(label)
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-bold mb-1.5">Day {labelMap?.get(day) ?? day}</p>
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

export function MonthlyCurvesChart({ data }: { data: MonthlyCurveRow[] }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const gridColor = isDark ? '#374151' : '#e5e7eb'
  const textColor = isDark ? '#9ca3af' : '#6b7280'

  const { months, chartData, dailyMap, labelMap } = useMemo(() => {
    const monthSet = new Set<string>()
    const cumMap = new Map<number, Record<string, number>>()
    const dMap = new Map<number, Record<string, number>>()
    const lMap = new Map<number, number>()

    for (const row of data) {
      monthSet.add(row.bill_month)
      const a = cumMap.get(row.day) || {}
      a[row.bill_month] = row.cumulative_amount
      cumMap.set(row.day, a)
      const b = dMap.get(row.day) || {}
      b[row.bill_month] = row.daily_amount
      dMap.set(row.day, b)
      if (!lMap.has(row.day)) {
        lMap.set(row.day, row.day_label)
      }
    }

    const sortedMonths = Array.from(monthSet).sort(sortMonths)
    const maxDay = Math.max(...Array.from(cumMap.keys()), 0)
    const points: Record<string, any>[] = []
    for (let d = 1; d <= maxDay; d++) {
      const point: Record<string, any> = { day: d }
      for (const m of sortedMonths) {
        point[m] = cumMap.get(d)?.[m] ?? null
      }
      points.push(point)
    }

    return { months: sortedMonths, chartData: points, dailyMap: dMap, labelMap: lMap }
  }, [data])

  const [hidden, setHidden] = useState<Set<string>>(new Set())

  if (!data.length) {
    return <div className="flex items-center justify-center h-48 text-xs text-muted-foreground">No cumulative data</div>
  }

  const handleLegendClick = (entry: any) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(entry.value)) next.delete(entry.value)
      else next.add(entry.value)
      return next
    })
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis
          dataKey="day"
          tickFormatter={cycleTick}
          tick={{ fontSize: 10, fill: textColor }}
          tickLine={false}
          axisLine={{ stroke: gridColor }}
          label={{ value: 'Date', position: 'insideBottom', offset: -4, style: { fontSize: 10, fill: textColor } }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: textColor }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => v >= 10000000 ? `${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v.toLocaleString()}
        />
        <Tooltip content={<CustomTooltip dailyMap={dailyMap} labelMap={labelMap} />} />
        <Legend
          onClick={handleLegendClick}
          formatter={(value: string) => (
            <span style={{ color: hidden.has(value) ? textColor : undefined, fontSize: 11, textDecoration: hidden.has(value) ? 'line-through' : 'none', cursor: 'pointer' }}>
              {MONTH_LABELS[value] || value}
            </span>
          )}
          iconSize={8}
        />
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
      </LineChart>
    </ResponsiveContainer>
  )
}
