'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useOrphanPsids } from '@/hooks/use-orphan-psids'
import { currentMonth } from '@/lib/constants'
import { AlertCircle } from 'lucide-react'

function formatRs(n: number) {
  return `Rs. ${n.toLocaleString()}`
}

export function OrphanPsidTable() {
  const [filterMonth, setFilterMonth] = useState('')
  const { data, isLoading, isError } = useOrphanPsids(filterMonth || undefined)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
          <p className="text-sm text-muted-foreground">Failed to load orphan PSIDs</p>
        </CardContent>
      </Card>
    )
  }

  if (!data || !data.rows.length) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No orphan PSIDs found — all payments match survey records.
        </CardContent>
      </Card>
    )
  }

  const monthOptions = data.month_totals.sort((a, b) => {
    const parse = (m: string) => {
      const months: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 }
      const mon = m.slice(0, 3)
      const yr = parseInt(m.slice(3))
      return yr * 12 + (months[mon] || 0)
    }
    return parse(b.bill_month) - parse(a.bill_month)
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold">Orphan PSIDs (no matching survey record)</h3>
        <select
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="ml-auto text-xs border rounded px-2 py-1 bg-background"
        >
          <option value="">All months</option>
          {monthOptions.map(mo => (
            <option key={mo.bill_month} value={mo.bill_month}>
              {mo.bill_month} ({mo.psids} PSIDs, {formatRs(mo.amount)})
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border bg-card flex flex-col">
        <div className="overflow-auto max-h-[400px]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50 sticky top-0 z-10">
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">PSID</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Month</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Amount</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Paid Date</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">District</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Tehsil</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">UC Name</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.psid + row.bill_month} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-1.5 font-mono text-[11px]">{row.psid}</td>
                  <td className="px-3 py-1.5">{row.bill_month}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatRs(row.amount_paid)}</td>
                  <td className="px-3 py-1.5">{row.paid_date ? new Date(row.paid_date + 'T00:00:00').toLocaleDateString() : '-'}</td>
                  <td className="px-3 py-1.5">{row.city_district || '-'}</td>
                  <td className="px-3 py-1.5">{row.tehsil || '-'}</td>
                  <td className="px-3 py-1.5 max-w-[200px] truncate" title={row.uc_name || ''}>{row.uc_name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 text-[10px] text-muted-foreground border-t bg-card shrink-0">
          {data.total} orphan PSID{data.total !== 1 ? 's' : ''} total
          {' | '}
          Total orphan amount: {formatRs(data.month_totals.reduce((s, m) => s + m.amount, 0))}
        </div>
      </div>
    </div>
  )
}
