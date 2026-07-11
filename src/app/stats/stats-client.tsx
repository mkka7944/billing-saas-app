'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { useStaffStats, useUCStats } from '@/hooks/use-staff-stats'
import { useStaffList, useStaffAssignment } from '@/hooks/use-assignments'
import { useStaffPerformance, useSavePerformance } from '@/hooks/use-staff-performance'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, CheckCircle2, XCircle, TrendingUp, Star, FileText, CameraOff, Info, Building2 } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import type { StaffMember } from '@/hooks/use-assignments'

export function StatsClient({ initialStaffList }: { initialStaffList: StaffMember[] }) {
  const roleName = useAuthStore((s) => s.roleName)
  const user = useAuthStore((s) => s.user)
  const setPageIdentity = useBillingUIStore((s) => s.setPageIdentity)
  const [selectedStaff, setSelectedStaff] = useState<string>('')
  const [dateRange, setDateRange] = useState<'7' | '30' | '90'>('7')
  const [viewMode, setViewMode] = useState<'staff' | 'uc'>('staff')
  const [modalStaff, setModalStaff] = useState<{ id: string; name: string } | null>(null)
  const [perfRating, setPerfRating] = useState<number>(3)
  const [perfNotes, setPerfNotes] = useState('')

  const now = new Date()
  const toDate = now.toISOString().slice(0, 10)
  const fromDate = new Date(now.getTime() - parseInt(dateRange) * 86400000).toISOString().slice(0, 10)

  const { data: liveStaffList } = useStaffList()
  const staffList = liveStaffList || initialStaffList
  const { data: stats, isLoading } = useStaffStats(
    viewMode === 'staff' ? (selectedStaff || undefined) : undefined,
    fromDate, toDate
  )
  const { data: ucStats, isLoading: ucLoading } = useUCStats(
    viewMode === 'uc' ? fromDate : undefined,
    viewMode === 'uc' ? toDate : undefined
  )
  const { data: perfRecords } = useStaffPerformance(modalStaff?.id || undefined, fromDate, toDate)
  const savePerf = useSavePerformance()

  useEffect(() => { setPageIdentity('Delivery Stats') }, [setPageIdentity])

  if (roleName !== 'admin' && roleName !== 'super_admin') {
    return <StaffPersonalStats userId={user?.id || null} />
  }

  const totals = stats?.reduce(
    (s, r) => ({
      assigned: s.assigned + r.total_assigned,
      delivered: s.delivered + r.delivered,
      missed: s.missed + r.missed,
      pending: s.pending + r.pending,
    }),
    { assigned: 0, delivered: 0, missed: 0, pending: 0 }
  )

  const overallRate = totals && totals.assigned > 0 ? Math.round((totals.delivered / totals.assigned) * 100) : 0

  function handleRowClick(sid: string, name: string) {
    setModalStaff({ id: sid, name })
    setPerfRating(3)
    setPerfNotes('')
  }

  async function handleSavePerformance() {
    if (!modalStaff) return
    await savePerf.mutateAsync({
      staff_id: modalStaff.id,
      assigned_date: toDate,
      rating: perfRating,
      notes: perfNotes || undefined,
    })
    setModalStaff(null)
  }

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setViewMode('staff')}
              className={`px-3 h-9 text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5 ${
                viewMode === 'staff' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              By Staff
            </button>
            <button
              onClick={() => setViewMode('uc')}
              className={`px-3 h-9 text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5 ${
                viewMode === 'uc' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              By UC
            </button>
          </div>
          {viewMode === 'staff' && (
            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border bg-background text-xs font-medium outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All Staff</option>
              {staffList?.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name || s.id}</option>
              ))}
            </select>
          )}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['7', '30', '90'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDateRange(d)}
                className={`px-3 h-9 text-xs font-medium cursor-pointer transition-colors ${
                  dateRange === d ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {viewMode === 'staff' && totals && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-xs text-muted-foreground">Assigned</CardTitle><div className="p-1 rounded bg-blue-100 dark:bg-blue-900/30"><Users className="h-4 w-4 text-blue-600 dark:text-blue-300" /></div></CardHeader>
              <CardContent><p className="text-xl font-bold">{totals.assigned}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-xs text-muted-foreground">Delivered</CardTitle><div className="p-1 rounded bg-green-100 dark:bg-green-900/30"><CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-300" /></div></CardHeader>
              <CardContent><p className="text-xl font-bold text-green-600 dark:text-green-300">{totals.delivered}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-xs text-muted-foreground">Missed</CardTitle><div className="p-1 rounded bg-red-100 dark:bg-red-900/30"><XCircle className="h-4 w-4 text-red-600 dark:text-red-300" /></div></CardHeader>
              <CardContent><p className="text-xl font-bold text-red-600 dark:text-red-300">{totals.missed}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-xs text-muted-foreground">Rate</CardTitle><div className="p-1 rounded bg-purple-100 dark:bg-purple-900/30"><TrendingUp className="h-4 w-4 text-purple-600 dark:text-purple-300" /></div></CardHeader>
              <CardContent><p className="text-xl font-bold">{overallRate}%</p></CardContent>
            </Card>
          </div>
        )}
        {viewMode === 'uc' && ucStats && ucStats.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-xs text-muted-foreground">UCs</CardTitle><div className="p-1 rounded bg-blue-100 dark:bg-blue-900/30"><Building2 className="h-4 w-4 text-blue-600 dark:text-blue-300" /></div></CardHeader>
              <CardContent><p className="text-xl font-bold">{ucStats.length}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-xs text-muted-foreground">Total Assigned</CardTitle><div className="p-1 rounded bg-blue-100 dark:bg-blue-900/30"><Users className="h-4 w-4 text-blue-600 dark:text-blue-300" /></div></CardHeader>
              <CardContent><p className="text-xl font-bold">{ucStats.reduce((s, u) => s + u.total_assigned, 0)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-xs text-muted-foreground">Delivered</CardTitle><div className="p-1 rounded bg-green-100 dark:bg-green-900/30"><CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-300" /></div></CardHeader>
              <CardContent><p className="text-xl font-bold text-green-600 dark:text-green-300">{ucStats.reduce((s, u) => s + u.delivered, 0)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-xs text-muted-foreground">Rate</CardTitle><div className="p-1 rounded bg-purple-100 dark:bg-purple-900/30"><TrendingUp className="h-4 w-4 text-purple-600 dark:text-purple-300" /></div></CardHeader>
              <CardContent><p className="text-xl font-bold">{Math.round((ucStats.reduce((s, u) => s + u.delivered, 0) / ucStats.reduce((s, u) => s + u.total_assigned, 0)) * 100)}%</p></CardContent>
            </Card>
          </div>
        )}

        {viewMode === 'staff' && (isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left font-semibold px-3 py-2">Staff</th>
                  <th className="text-right font-semibold px-3 py-2">Assigned</th>
                  <th className="text-right font-semibold px-3 py-2">Delivered</th>
                  <th className="text-right font-semibold px-3 py-2">Missed</th>
                  <th className="text-right font-semibold px-3 py-2">Pending</th>
                  <th className="text-right font-semibold px-3 py-2">Rate</th>
                  <th className="text-right font-semibold px-3 py-2 px-3">Perf</th>
                </tr>
              </thead>
              <tbody>
                {stats?.map((s) => (
                  <tr key={s.staff_id} className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => handleRowClick(s.staff_id, s.staff_name)}>
                    <td className="px-3 py-2 font-medium">{s.staff_name}</td>
                    <td className="px-3 py-2 text-right">{s.total_assigned}</td>
                    <td className="px-3 py-2 text-right text-green-600 dark:text-green-300 font-medium">{s.delivered}</td>
                    <td className="px-3 py-2 text-right text-red-600 dark:text-red-300">{s.missed}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{s.pending}</td>
                    <td className="px-3 py-2 text-right font-bold">{s.rate}%</td>
                    <td className="px-3 py-2 text-right"><Star className="h-3.5 w-3.5 inline text-muted-foreground" /></td>
                  </tr>
                ))}
                {(!stats || stats.length === 0) && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No delivery data for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
        {viewMode === 'uc' && (ucLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left font-semibold px-3 py-2">UC</th>
                  <th className="text-right font-semibold px-3 py-2">Staff</th>
                  <th className="text-right font-semibold px-3 py-2">Assigned</th>
                  <th className="text-right font-semibold px-3 py-2">Delivered</th>
                  <th className="text-right font-semibold px-3 py-2">Missed</th>
                  <th className="text-right font-semibold px-3 py-2">Pending</th>
                  <th className="text-right font-semibold px-3 py-2">Rate</th>
                </tr>
              </thead>
              <tbody>
                {ucStats?.map((u) => (
                  <tr key={u.uc_name} className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer">
                    <td className="px-3 py-2 font-medium">{u.uc_name}</td>
                    <td className="px-3 py-2 text-right">{u.staff_count}</td>
                    <td className="px-3 py-2 text-right">{u.total_assigned}</td>
                    <td className="px-3 py-2 text-right text-green-600 dark:text-green-300 font-medium">{u.delivered}</td>
                    <td className="px-3 py-2 text-right text-red-600 dark:text-red-300">{u.missed}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{u.pending}</td>
                    <td className="px-3 py-2 text-right font-bold">{u.rate}%</td>
                  </tr>
                ))}
                {(!ucStats || ucStats.length === 0) && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No UC data for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {modalStaff && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={() => setModalStaff(null)}>
          <div className="w-full max-w-sm bg-background rounded-t-xl sm:rounded-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold flex items-center gap-2"><FileText className="h-4 w-4" />{modalStaff.name}</h2>
              <button className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-muted cursor-pointer text-sm" onClick={() => setModalStaff(null)}>✕</button>
            </div>

            <p className="text-xs text-muted-foreground">Performance for today ({toDate})</p>

            <div>
              <label className="text-xs font-medium block mb-1.5">Rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((r) => (
                  <button
                    key={r}
                    onClick={() => setPerfRating(r)}
                    className={`h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold cursor-pointer transition-colors ${
                      r <= perfRating ? 'bg-yellow-100 text-yellow-700' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1.5">Notes</label>
              <textarea
                value={perfNotes}
                onChange={(e) => setPerfNotes(e.target.value)}
                placeholder="Performance notes..."
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            {perfRecords && perfRecords.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Recent notes</p>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {perfRecords.slice(0, 5).map((pr) => (
                    <div key={pr.id} className="p-2 rounded-lg bg-muted/30">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{pr.assigned_date}</span>
                        {pr.rating && <span className="text-xs font-bold text-yellow-700 dark:text-yellow-300">{'★'.repeat(pr.rating)}</span>}
                      </div>
                      {pr.notes && <p className="text-xs mt-0.5 text-muted-foreground">{pr.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setModalStaff(null)}
                className="flex-1 h-9 rounded-lg border border-border text-xs font-medium hover:bg-muted cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePerformance}
                disabled={savePerf.isPending}
                className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {savePerf.isPending ? 'Saving...' : 'Save Performance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

function StaffPersonalStats({ userId }: { userId: string | null }) {
  const [dateRange, setDateRange] = useState<'7' | '30' | '90'>('7')
  const now = new Date()
  const toDate = now.toISOString().slice(0, 10)
  const fromDate = new Date(now.getTime() - parseInt(dateRange) * 86400000).toISOString().slice(0, 10)

  const { data: assignment } = useStaffAssignment(userId)
  const { data: stats, isLoading } = useStaffStats(userId || undefined, fromDate, toDate)
  const [failedUploads, setFailedUploads] = useState<{ id: string; psid: string; captured_at: string; gps_lat: number | null; gps_lng: number | null }[]>([])
  const [failedExpanded, setFailedExpanded] = useState(false)

  useEffect(() => {
    if (!userId) return
    fetch('/api/deliveries/failed-uploads')
      .then(r => r.json())
      .then(json => {
        if (json.photos) setFailedUploads(json.photos)
      })
      .catch(() => {})
  }, [userId])

  const todayItems = assignment?.items || []
  const todayDelivered = todayItems.filter((i) => i.status === 'delivered').length
  const todayMissed = todayItems.filter((i) => i.status === 'missed').length
  const todayPending = todayItems.filter((i) => i.status === 'pending').length
  const todayTotal = todayItems.length

  const totals = stats?.reduce(
    (s, r) => ({
      assigned: s.assigned + r.total_assigned,
      delivered: s.delivered + r.delivered,
      missed: s.missed + r.missed,
      pending: s.pending + r.pending,
    }),
    { assigned: 0, delivered: 0, missed: 0, pending: 0 }
  )
  const rate = totals && totals.assigned > 0 ? Math.round((totals.delivered / totals.assigned) * 100) : 0

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Today's assignment */}
        {todayTotal > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Today&apos;s Assignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all rounded-full"
                  style={{ width: `${Math.round((todayDelivered / todayTotal) * 100)}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-2">
                  <p className="text-lg font-bold text-green-600">{todayDelivered}</p>
                  <p className="text-muted-foreground">Delivered</p>
                </div>
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-2">
                  <p className="text-lg font-bold text-red-600">{todayMissed}</p>
                  <p className="text-muted-foreground">Missed</p>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-2">
                  <p className="text-lg font-bold text-blue-600">{todayPending}</p>
                  <p className="text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Historical stats */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Performance</CardTitle>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as '7' | '30' | '90')}
              className="text-xs border rounded-md px-2 py-1 bg-background"
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : totals && totals.assigned > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Delivery Rate</span>
                  <span className="font-bold text-green-600">{rate}%</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-lg font-bold">{totals.assigned}</p>
                    <p className="text-muted-foreground">Assigned</p>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-lg font-bold">{totals.delivered}</p>
                    <p className="text-muted-foreground">Delivered</p>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-lg font-bold">{totals.missed}</p>
                    <p className="text-muted-foreground">Missed</p>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-lg font-bold">{totals.pending}</p>
                    <p className="text-muted-foreground">Pending</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No stats available</p>
            )}
          </CardContent>
        </Card>

        {/* Failed Uploads */}
        {failedUploads.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-amber-600 flex items-center gap-1.5">
                <CameraOff className="h-3.5 w-3.5" />
                Failed Uploads ({failedUploads.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                These deliveries were marked but the photo never reached Google Drive.
                Show this list to your supervisor to verify.
              </p>
              <div className="space-y-1">
                {failedUploads.slice(0, failedExpanded ? undefined : 5).map(fu => (
                  <div key={fu.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-muted/50">
                    <span className="font-mono font-medium">{fu.psid}</span>
                    <span className="text-muted-foreground">
                      {new Date(fu.captured_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
              {failedUploads.length > 5 && (
                <button
                  onClick={() => setFailedExpanded(!failedExpanded)}
                  className="text-[11px] font-medium text-blue-500 hover:text-blue-600 cursor-pointer"
                >
                  {failedExpanded ? 'Show less' : `Show all ${failedUploads.length}`}
                </button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
