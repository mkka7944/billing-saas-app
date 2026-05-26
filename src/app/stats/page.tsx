'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { useStaffStats } from '@/hooks/use-staff-stats'
import { useStaffList } from '@/hooks/use-assignments'
import { useStaffPerformance, useSavePerformance } from '@/hooks/use-staff-performance'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, CheckCircle2, XCircle, TrendingUp, Star, FileText } from 'lucide-react'
import { AppHeader } from '@/components/layout/AppHeader'

export default function StatsPage() {
  const router = useRouter()
  const role = useAuthStore((s) => s.role)
  const setPageIdentity = useBillingUIStore((s) => s.setPageIdentity)
  const [selectedStaff, setSelectedStaff] = useState<string>('')
  const [dateRange, setDateRange] = useState<'7' | '30' | '90'>('7')
  const [modalStaff, setModalStaff] = useState<{ id: string; name: string } | null>(null)
  const [perfRating, setPerfRating] = useState<number>(3)
  const [perfNotes, setPerfNotes] = useState('')

  const now = new Date()
  const toDate = now.toISOString().slice(0, 10)
  const fromDate = new Date(now.getTime() - parseInt(dateRange) * 86400000).toISOString().slice(0, 10)

  const { data: staffList } = useStaffList()
  const { data: stats, isLoading } = useStaffStats(selectedStaff || undefined, fromDate, toDate)
  const { data: perfRecords } = useStaffPerformance(modalStaff?.id || undefined, fromDate, toDate)
  const savePerf = useSavePerformance()

  useEffect(() => { setPageIdentity('Staff Delivery Stats') }, [setPageIdentity])

  if (role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Access denied. Admin only.</p>
      </div>
    )
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
    <div className="h-full flex flex-col">
      <AppHeader forceBack onBack={() => router.push('/map')} />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-wrap gap-3">
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

        {totals && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-xs text-muted-foreground">Assigned</CardTitle><div className="p-1 rounded bg-blue-100"><Users className="h-4 w-4 text-blue-600" /></div></CardHeader>
              <CardContent><p className="text-xl font-bold">{totals.assigned}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-xs text-muted-foreground">Delivered</CardTitle><div className="p-1 rounded bg-green-100"><CheckCircle2 className="h-4 w-4 text-green-600" /></div></CardHeader>
              <CardContent><p className="text-xl font-bold text-green-600">{totals.delivered}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-xs text-muted-foreground">Missed</CardTitle><div className="p-1 rounded bg-red-100"><XCircle className="h-4 w-4 text-red-600" /></div></CardHeader>
              <CardContent><p className="text-xl font-bold text-red-600">{totals.missed}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-xs text-muted-foreground">Rate</CardTitle><div className="p-1 rounded bg-purple-100"><TrendingUp className="h-4 w-4 text-purple-600" /></div></CardHeader>
              <CardContent><p className="text-xl font-bold">{overallRate}%</p></CardContent>
            </Card>
          </div>
        )}

        {isLoading ? (
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
                    <td className="px-3 py-2 text-right text-green-600 font-medium">{s.delivered}</td>
                    <td className="px-3 py-2 text-right text-red-600">{s.missed}</td>
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
        )}
      </div>

      {/* Performance modal */}
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

            {/* Previous records */}
            {perfRecords && perfRecords.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Recent notes</p>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {perfRecords.slice(0, 5).map((pr) => (
                    <div key={pr.id} className="p-2 rounded-lg bg-muted/30">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">{pr.assigned_date}</span>
                        {pr.rating && <span className="text-xs font-bold text-yellow-700">{'★'.repeat(pr.rating)}</span>}
                      </div>
                      {pr.notes && <p className="text-[11px] mt-0.5 text-muted-foreground">{pr.notes}</p>}
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
    </div>
  )
}
