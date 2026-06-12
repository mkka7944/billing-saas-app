'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, RefreshCw, ChevronDown, ChevronRight, TrendingUp, AlertTriangle, CameraOff, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { currentMonth, MONTHS } from '@/lib/constants'

interface StaffQuality {
  staff_id: string
  staff_name: string
  assigned_city: string
  total_assigned: number
  total_delivered: number
  photo_fail_count: number
  gps_oor_count: number
  fail_rate: number
  quality_score: number
}

type SortKey = keyof StaffQuality
type SortDir = 'asc' | 'desc'

function generateMonths(): string[] {
  const result: string[] = []
  const d = new Date()
  for (let i = 0; i < 12; i++) {
    const m = d.getMonth()
    const y = d.getFullYear()
    result.push(`${MONTHS[m]}${y}`)
    d.setMonth(d.getMonth() - 1)
  }
  return result
}

function qualityLabel(score: number): { label: string; className: string } {
  if (score >= 90) return { label: 'Excellent', className: 'text-green-600 bg-green-500/10 border-green-200' }
  if (score >= 70) return { label: 'Good', className: 'text-blue-600 bg-blue-500/10 border-blue-200' }
  if (score >= 50) return { label: 'Fair', className: 'text-amber-600 bg-amber-500/10 border-amber-200' }
  return { label: 'Poor', className: 'text-red-600 bg-red-500/10 border-red-200' }
}

export function DeliveryQualityTab() {
  const [rows, setRows] = useState<StaffQuality[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(currentMonth())
  const [sortKey, setSortKey] = useState<SortKey>('quality_score')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const months = useMemo(() => generateMonths(), [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/deliveries/quality?month=${month}`)
      const json = await res.json()
      if (json.rows) setRows(json.rows)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })
  }, [rows, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const totalFailRate = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.total_delivered, 0)
    const fails = rows.reduce((s, r) => s + r.photo_fail_count + r.gps_oor_count, 0)
    return total > 0 ? ((fails / total) * 100).toFixed(1) : '0.0'
  }, [rows])

  const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => (
    <span className={cn('ml-1 text-[10px]', active ? 'text-foreground' : 'text-muted-foreground/30')}>
      {active ? (dir === 'asc' ? '\u25B2' : '\u25BC') : '\u25B2'}
    </span>
  )

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-primary" />
                Delivery Quality
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Per-staff delivery metrics for the selected billing month.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-7 text-xs rounded-lg border border-border bg-background px-2 outline-none focus:ring-1 focus:ring-ring"
              >
                {months.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <button
                onClick={fetchData}
                disabled={loading}
                className="h-7 px-2.5 text-[11px] font-medium rounded-lg bg-muted hover:bg-accent flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
                Refresh
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-2">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span><strong className="text-foreground">{rows.length}</strong> staff</span>
            <span><strong className="text-foreground">{rows.reduce((s, r) => s + r.total_assigned, 0)}</strong> assigned</span>
            <span><strong className="text-foreground">{rows.reduce((s, r) => s + r.total_delivered, 0)}</strong> delivered</span>
            <span className="flex items-center gap-1"><CameraOff className="h-3 w-3 text-amber-500" /> <strong className="text-foreground">{rows.reduce((s, r) => s + r.photo_fail_count, 0)}</strong> photo fails</span>
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-amber-500" /> <strong className="text-foreground">{rows.reduce((s, r) => s + r.gps_oor_count, 0)}</strong> GPS OOR</span>
            <span>Fail rate: <strong className={cn(parseFloat(totalFailRate) > 20 ? 'text-red-500' : parseFloat(totalFailRate) > 10 ? 'text-amber-500' : 'text-green-500')}>{totalFailRate}%</strong></span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading...
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-1">
              <TrendingUp className="h-6 w-6" />
              <p className="text-sm font-medium">No data</p>
              <p className="text-xs">No delivery data for {month}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground cursor-pointer hover:text-foreground min-w-[120px]" onClick={() => handleSort('staff_name')}>
                      Staff <SortIcon active={sortKey === 'staff_name'} dir={sortDir} />
                    </th>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground cursor-pointer hover:text-foreground min-w-[80px]" onClick={() => handleSort('assigned_city')}>
                      City <SortIcon active={sortKey === 'assigned_city'} dir={sortDir} />
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground cursor-pointer hover:text-foreground min-w-[60px]" onClick={() => handleSort('total_assigned')}>
                      Assigned <SortIcon active={sortKey === 'total_assigned'} dir={sortDir} />
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground cursor-pointer hover:text-foreground min-w-[60px]" onClick={() => handleSort('total_delivered')}>
                      Delivered <SortIcon active={sortKey === 'total_delivered'} dir={sortDir} />
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground cursor-pointer hover:text-foreground min-w-[60px]" onClick={() => handleSort('photo_fail_count')}>
                      Photo Fails <SortIcon active={sortKey === 'photo_fail_count'} dir={sortDir} />
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground cursor-pointer hover:text-foreground min-w-[60px]" onClick={() => handleSort('gps_oor_count')}>
                      GPS OOR <SortIcon active={sortKey === 'gps_oor_count'} dir={sortDir} />
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground cursor-pointer hover:text-foreground min-w-[60px]" onClick={() => handleSort('fail_rate')}>
                      Fail Rate <SortIcon active={sortKey === 'fail_rate'} dir={sortDir} />
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground cursor-pointer hover:text-foreground min-w-[80px]" onClick={() => handleSort('quality_score')}>
                      Score <SortIcon active={sortKey === 'quality_score'} dir={sortDir} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(row => {
                    const ql = qualityLabel(row.quality_score)
                    return (
                      <tr
                        key={row.staff_id}
                        className="border-b border-border hover:bg-accent/30 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(expandedId === row.staff_id ? null : row.staff_id)}
                      >
                        <td className="px-3 py-2.5 font-medium">
                          <div className="flex items-center gap-1.5">
                            {expandedId === row.staff_id ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                            {row.staff_name}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{row.assigned_city || '\u2014'}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{row.total_assigned}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{row.total_delivered}</td>
                        <td className={cn('px-3 py-2.5 text-right font-mono', row.photo_fail_count > 0 && 'text-amber-600 font-semibold')}>
                          {row.photo_fail_count}
                        </td>
                        <td className={cn('px-3 py-2.5 text-right font-mono', row.gps_oor_count > 0 && 'text-amber-600 font-semibold')}>
                          {row.gps_oor_count}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          <span className={cn(
                            row.fail_rate > 20 ? 'text-red-500' : row.fail_rate > 10 ? 'text-amber-500' : 'text-green-500'
                          )}>
                            {row.fail_rate}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={cn('inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold border', ql.className)}>
                            {row.quality_score.toFixed(0)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
