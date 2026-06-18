'use client'

import { useState } from 'react'
import { useAssignmentList, useRevokeAssignment, useRefreshAssignment } from '@/hooks/use-assignments'
import { useBillMonths } from '@/hooks/use-bill-months'
import { useBillingStore } from '@/stores/billing-store'
import { CITY_TEHSIL_MAP } from '@/lib/queries/hierarchy'
import { currentMonth } from '@/lib/constants'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { RotateCw, XCircle } from 'lucide-react'

export function ManageAssignmentsTab() {
  const confirm = useConfirm()
  const { toast } = useToast()
  const selectedCity = useBillingStore((s) => s.selectedCity)
  const cityCfg = selectedCity ? CITY_TEHSIL_MAP[selectedCity] : null
  const { data: billMonths } = useBillMonths()
  const [month, setMonth] = useState(currentMonth())
  const { data: assignments, isLoading } = useAssignmentList(cityCfg?.district, cityCfg?.tehsil, month)
  const revoke = useRevokeAssignment()
  const refresh = useRefreshAssignment()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <label className="text-xs text-muted-foreground">Month:</label>
        <Select value={month} onValueChange={(v) => { if (v) setMonth(v) }}>
          <SelectTrigger className="h-8 w-36 text-xs">
            {month || currentMonth()}
          </SelectTrigger>
          <SelectContent>
            {(billMonths || []).map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          Loading assignments...
        </div>
      ) : !assignments?.length ? (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          No assignments for {month}
        </div>
      ) : (
        (() => {
          const byUc = new Map<string, typeof assignments>()
          for (const a of assignments) {
            if (!byUc.has(a.uc_name)) byUc.set(a.uc_name, [])
            byUc.get(a.uc_name)!.push(a)
          }
          return Array.from(byUc.entries()).map(([ucName, rows]) => (
            <Card key={ucName}>
              <CardContent className="p-0">
                <div className="px-4 py-2 border-b border-border">
                  <h3 className="text-xs font-semibold text-foreground">{ucName}</h3>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-semibold">Staff</TableHead>
                        <TableHead className="text-xs font-semibold max-md:hidden">Batch</TableHead>
                        <TableHead className="text-xs font-semibold text-right max-md:hidden">Month</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Total</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Delivered</TableHead>
                        <TableHead className="text-xs font-semibold text-right max-md:hidden">Missed</TableHead>
                        <TableHead className="text-xs font-semibold text-right max-md:hidden">Pending</TableHead>
                        <TableHead className="text-xs font-semibold text-right">%</TableHead>
                        <TableHead className="w-10" />
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-sm font-medium">{a.staff_name}</TableCell>
                          <TableCell className="text-sm max-md:hidden text-muted-foreground font-mono">{a.name || '—'}</TableCell>
                          <TableCell className="text-sm text-right tabular-nums max-md:hidden text-muted-foreground">{a.bill_month}</TableCell>
                          <TableCell className="text-sm text-right tabular-nums">{a.total_items}</TableCell>
                          <TableCell className="text-sm text-right tabular-nums text-green-600">{a.delivered}</TableCell>
                          <TableCell className="text-sm text-right tabular-nums max-md:hidden text-red-500">{a.missed}</TableCell>
                          <TableCell className="text-sm text-right tabular-nums max-md:hidden text-amber-600">{a.pending}</TableCell>
                          <TableCell className="text-sm text-right tabular-nums font-medium">{a.completion_pct}%</TableCell>
                          <TableCell>
                            <button
                              onClick={async () => {
                                const ok = await confirm({
                                  title: 'Revoke Assignment',
                                  message: 'Are you sure you want to revoke this assignment? This will free up the bills for reassignment.',
                                  confirmLabel: 'Revoke',
                                  variant: 'destructive',
                                })
                                if (ok) revoke.mutate(a.id)
                              }}
                              className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                            >
                              <XCircle className="size-4" />
                            </button>
                          </TableCell>
                          <TableCell>
                            <button
                              onClick={async () => {
                                const ok = await confirm({
                                  title: 'Refresh Assignment',
                                  message: 'Replace pending items with the latest unassigned bills? Delivered/missed items will be kept.',
                                  confirmLabel: 'Refresh',
                                  variant: 'default',
                                })
                                if (!ok) return
                                try {
                                  const result = await refresh.mutateAsync(a.id)
                                  toast(`Refreshed — ${result.inserted} items added`, 'success')
                                } catch (e) {
                                  toast((e as Error).message, 'error')
                                }
                              }}
                              disabled={refresh.isPending}
                              className="p-1 text-muted-foreground hover:text-blue-500 transition-colors"
                            >
                              <RotateCw className={`size-4 ${refresh.isPending ? 'animate-spin' : ''}`} />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))
        })()
      )}
    </div>
  )
}
