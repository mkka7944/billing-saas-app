'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronDown, ChevronRight, Database, Activity, Camera, Users, FileText, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TableInfo {
  name: string
  sizeMb: number
  rows: number
}

interface UsageData {
  plan: string
  billingCycle: { start: string; end: string }
  bandwidth: { usedMb: number | null; limitMb: number; estimated: boolean }
  apiRequests: { total: number; hourly: { timestamp: string; rest: number; auth: number; realtime: number; storage: number }[] }
  database: { totalMb: number; tables: TableInfo[] }
  storage: { totalMb: number; buckets: { name: string; sizeMb: number; count: number }[] }
  kpis: {
    deliveriesToday: number
    photosThisMonth: number
    photosTotal: number
    activeStaffThisMonth: number
    assignmentsThisMonth: number
    unitsActive: number
    unitsTotal: number
    collectionThisMonth: number
  }
}

function GaugeBar({ label, used, total, unit, color }: { label: string; used: number; total: number; unit: string; color?: string }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0
  const barColor = color || (pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-green-500')
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{used.toFixed(1)} / {total} {unit}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-muted-foreground">{pct.toFixed(0)}% used</p>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-bold tabular-nums">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
      </div>
    </div>
  )
}

function CollapsibleTable({ title, tables }: { title: string; tables: TableInfo[] }) {
  const [open, setOpen] = useState(false)
  if (!tables.length) return null
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 cursor-pointer hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title} ({tables.length})
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-left py-1 pr-2 font-medium">Table</th>
                <th className="text-right px-2 font-medium">Size</th>
                <th className="text-right pl-2 font-medium">Rows</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => (
                <tr key={t.name} className="border-b border-border/50">
                  <td className="py-1 pr-2 font-mono text-[11px] truncate max-w-[200px]">{t.name}</td>
                  <td className="text-right px-2 tabular-nums">{t.sizeMb.toFixed(1)} MB</td>
                  <td className="text-right pl-2 tabular-nums">{t.rows.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function UsageTab() {
  const { data, isLoading, error } = useQuery<UsageData>({
    queryKey: ['admin-usage'],
    queryFn: async () => {
      const res = await fetch('/api/admin/usage')
      if (!res.ok) throw new Error('Failed to load usage data')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
        <Skeleton className="h-32 rounded-lg" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          {error instanceof Error ? error.message : 'No data available'}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {/* Left column — Supabase infrastructure */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold">Supabase Usage</CardTitle>
              <Badge variant="outline" className="text-[10px] uppercase">{data.plan}</Badge>
            </div>
            <CardDescription className="text-xs">Project infrastructure metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">Bandwidth</span>
                <span className="font-semibold tabular-nums">— / {data.bandwidth.limitMb} MB</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden" />
              <p className="text-[10px] text-muted-foreground">Exact egress available on <a href="https://supabase.com/dashboard/org/egcdeijulodqozlinrum/usage" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Supabase dashboard</a></p>
              <p className="text-[10px] text-muted-foreground">Cycle: {data.billingCycle.start} → {data.billingCycle.end}</p>
            </div>

            <GaugeBar label="Database" used={data.database.totalMb} total={500} unit="MB" />
            <GaugeBar label="Storage" used={data.storage.totalMb} total={1024} unit="MB" />

            <div className="pt-1 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">API Requests</span>
                <span className="font-semibold tabular-nums">{data.apiRequests.total.toLocaleString()}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Free plan has unlimited API requests</p>
            </div>

            <CollapsibleTable title="Table Sizes" tables={data.database.tables} />
          </CardContent>
        </Card>

        {/* Right column — App KPIs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold">App KPIs</CardTitle>
            <CardDescription className="text-xs">Key metrics from your data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <StatCard icon={Activity} label="Deliveries Today" value={data.kpis.deliveriesToday} />
              <StatCard icon={Camera} label="Photos This Month" value={data.kpis.photosThisMonth} sub={`${data.kpis.photosTotal} total`} />
              <StatCard icon={Users} label="Active Staff" value={data.kpis.activeStaffThisMonth} sub="this month" />
              <StatCard icon={FileText} label="Assignments" value={data.kpis.assignmentsThisMonth} sub="this month" />
              <StatCard icon={Database} label="Active Units" value={data.kpis.unitsActive.toLocaleString()} sub={`${data.kpis.unitsTotal.toLocaleString()} total`} />
              <StatCard icon={DollarSign} label="Collection" value={`Rs. ${data.kpis.collectionThisMonth.toLocaleString()}`} sub="this month" />
              {/* Two filler cells to maintain grid on larger screens — hidden on mobile */}
              <div className="hidden md:block" />
              <div className="hidden md:block" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom — API request hourly breakdown (collapsible) */}
      {data.apiRequests.hourly.length > 0 && (
        <ApiHourlyChart data={data.apiRequests.hourly} />
      )}
    </div>
  )
}

function ApiHourlyChart({ data }: { data: UsageData['apiRequests']['hourly'] }) {
  const [open, setOpen] = useState(false)
  const recent = data.slice(-24)
  const maxReq = Math.max(...recent.map(r => r.rest + r.auth + r.realtime + r.storage), 1)

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 cursor-pointer"
        >
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <div>
            <CardTitle className="text-sm font-bold">API Requests (last 24h)</CardTitle>
            <CardDescription className="text-xs">Hourly breakdown by service</CardDescription>
          </div>
        </button>
      </CardHeader>
      {open && (
        <CardContent>
          <div className="overflow-x-auto">
            <div className="flex gap-[2px] h-24 items-end" style={{ minWidth: recent.length * 12 }}>
              {recent.map((h, i) => {
                const total = h.rest + h.auth + h.realtime + h.storage
                const pct = (total / maxReq) * 100
                return (
                  <div key={h.timestamp} className="relative group flex-1 min-w-[8px]">
                    <div
                      className="w-full bg-primary/60 rounded-t hover:bg-primary transition-colors cursor-pointer"
                      style={{ height: `${Math.max(pct, 1)}%` }}
                      title={`${h.timestamp}: ${total} req (REST: ${h.rest}, Auth: ${h.auth})`}
                    />
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground mt-2">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-primary/60" /> REST</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-400/60" /> Auth</span>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
