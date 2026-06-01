'use client'

function formatRs(n: number) {
  return `Rs. ${n.toLocaleString()}`
}

function formatNum(n: number) {
  return n.toLocaleString()
}

interface StatItem {
  label: string
  value: string
}

export function ChartStatsPanel({ items }: { items: StatItem[] }) {
  if (!items.length) return null
  return (
    <div className="inline-flex flex-wrap gap-x-4 gap-y-0.5 rounded-lg border bg-card/90 backdrop-blur-sm px-3 py-2 text-xs shadow-sm shrink-0">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="text-muted-foreground">{item.label}</span>
          <span className="font-semibold text-foreground text-right ml-auto tabular-nums">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

export function getChartStats(
  data: { amount?: number; bills?: number; fine_total?: number }[],
  extra?: { label: string; value: string }[]
): StatItem[] {
  const items: StatItem[] = []
  const totalAmount = data.reduce((s, r) => s + (r.amount || 0), 0)
  const totalBills = data.reduce((s, r) => s + (r.bills || 0), 0)
  if (totalAmount > 0) items.push({ label: 'Total Collected', value: formatRs(totalAmount) })
  if (totalBills > 0) items.push({ label: 'Total Bills', value: formatNum(totalBills) })
  if (data[0]?.fine_total !== undefined) {
    const totalFines = data.reduce((s, r) => s + (r.fine_total || 0), 0)
    if (totalFines > 0) items.push({ label: 'Total Fines', value: formatRs(totalFines) })
  }
  if (extra) items.push(...extra)
  return items
}
