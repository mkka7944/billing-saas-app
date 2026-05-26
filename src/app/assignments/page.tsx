'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  useAssignmentTotals, useUnassignedBills, useStaffList, useCreateAssignment,
  useAssignmentList, useRevokeAssignment, type AssignmentWithStats,
} from '@/hooks/use-assignments'
import { ArrowLeft, BadgePlus, Loader2, Trash2 } from 'lucide-react'
import { useBillingUIStore } from '@/stores/billing-ui-store'

export default function AssignmentsPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const role = useAuthStore((s) => s.role)
  const setPageIdentity = useBillingUIStore((s) => s.setPageIdentity)
  const [tab, setTab] = useState<'create' | 'active'>('create')
  const [selectedUc, setSelectedUc] = useState<string | null>(null)
  const [selectedPsids, setSelectedPsids] = useState<Set<string>>(new Set())
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const [assignCount, setAssignCount] = useState<number>(50)
  const [search, setSearch] = useState('')

  const { data: totals, isLoading: totalsLoading } = useAssignmentTotals()
  const { data: bills, isLoading: billsLoading } = useUnassignedBills(selectedUc)
  const { data: staff } = useStaffList()
  const createAssignment = useCreateAssignment()
  const { data: activeAssignments, isLoading: activeLoading } = useAssignmentList()
  const revokeAssignment = useRevokeAssignment()

  useEffect(() => {
    if (!user) router.replace('/login')
  }, [user, router])

  useEffect(() => {
    setSelectedPsids(new Set())
    setSelectedStaffId(null)
  }, [selectedUc])

  const filteredTotals = totals?.filter((t) =>
    t.uc_name.toLowerCase().includes(search.toLowerCase())
  ) || []

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (!bills) return
    setSelectedPsids(checked ? new Set(bills.map((b) => b.psid!).filter(Boolean)) : new Set())
  }

  const togglePsid = (psid: string) => {
    const next = new Set(selectedPsids)
    if (next.has(psid)) next.delete(psid)
    else next.add(psid)
    setSelectedPsids(next)
  }

  const handleCreate = () => {
    if (!selectedStaffId || !selectedUc || !selectedPsids.size) return
    const psids = bills
      ?.filter((b) => b.psid && selectedPsids.has(b.psid))
      .map((b) => b.psid!) || []

    createAssignment.mutate({
      staff_id: selectedStaffId,
      assigned_date: new Date().toISOString().slice(0, 10),
      uc_name: selectedUc,
      psids: psids.slice(0, Math.max(1, assignCount)),
    }, {
      onSuccess: () => {
        setSelectedPsids(new Set())
        setSelectedStaffId(null)
      },
    })
  }

  useEffect(() => { setPageIdentity('Assignments') }, [setPageIdentity])

  if (!user) return null

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
          {selectedUc && tab === 'create' ? (
            <Button variant="ghost" size="icon" onClick={() => setSelectedUc(null)}>
              <ArrowLeft className="size-4" />
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button variant={tab === 'create' ? 'default' : 'ghost'} size="xs" onClick={() => { setTab('create'); setSelectedUc(null) }}>
                Create
              </Button>
              <Button variant={tab === 'active' ? 'default' : 'ghost'} size="xs" onClick={() => setTab('active')}>
                Active ({activeAssignments?.length || 0})
              </Button>
            </div>
          )}
          <h1 className="text-sm font-medium ml-auto">
            {selectedUc && tab === 'create' ? selectedUc : 'Assignments'}
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'active' ? <ActiveAssignmentsView
            assignments={activeAssignments}
            isLoading={activeLoading}
            onRevoke={(id) => revokeAssignment.mutate(id)}
            isRevoking={revokeAssignment.isPending}
          /> : !selectedUc ? <OverviewView
            totals={filteredTotals}
            isLoading={totalsLoading}
            search={search}
            onSearchChange={setSearch}
            onSelectUc={setSelectedUc}
          /> : <UcDetailView
            ucName={selectedUc}
            bills={bills}
            isLoading={billsLoading}
            selectedPsids={selectedPsids}
            onTogglePsid={togglePsid}
            onSelectAll={handleSelectAll}
            selectedStaffId={selectedStaffId}
            onStaffChange={setSelectedStaffId}
            staff={staff || []}
            assignCount={assignCount}
            onCountChange={setAssignCount}
            onCreate={handleCreate}
            isCreating={createAssignment.isPending}
          />}
        </div>
      </div>
    </AppShell>
  )
}

function OverviewView({
  totals, isLoading, search, onSearchChange, onSelectUc,
}: {
  totals: { uc_name: string; total: number; assigned: number; unassigned: number }[]
  isLoading: boolean
  search: string
  onSearchChange: (v: string) => void
  onSelectUc: (uc: string) => void
}) {
  return (
    <div className="space-y-4">
      <Input
        placeholder="Search UC..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-xs h-8 text-sm"
      />
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <Loader2 className="size-4 mr-2 animate-spin" /> Loading totals...
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Union Council</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Assigned</TableHead>
                <TableHead className="text-right">Unassigned</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {totals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No UCs with unassigned bills
                  </TableCell>
                </TableRow>
              ) : totals.map((t) => (
                <TableRow key={t.uc_name}>
                  <TableCell className="text-xs max-w-[300px] truncate">{t.uc_name}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{t.total}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{t.assigned}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    <span className={t.unassigned > 0 ? 'font-medium' : 'text-muted-foreground'}>
                      {t.unassigned}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={t.unassigned === 0}
                      onClick={() => onSelectUc(t.uc_name)}
                    >
                      Select
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function UcDetailView({
  ucName, bills, isLoading, selectedPsids, onTogglePsid, onSelectAll,
  selectedStaffId, onStaffChange, staff, assignCount, onCountChange,
  onCreate, isCreating,
}: {
  ucName: string
  bills: { survey_id: string; consumer_name: string | null; address: string | null; psid: string | null; amount_due: number | null; route_seq: number | null }[] | undefined
  isLoading: boolean
  selectedPsids: Set<string>
  onTogglePsid: (psid: string) => void
  onSelectAll: (checked: boolean | 'indeterminate') => void
  selectedStaffId: string | null
  onStaffChange: (v: string | null) => void
  staff: { id: string; full_name: string | null; assigned_ucs: string[] | null }[]
  assignCount: number
  onCountChange: (v: number) => void
  onCreate: () => void
  isCreating: boolean
}) {
  const unassignedBills = bills || []
  const allSelected = unassignedBills.length > 0 && selectedPsids.size === unassignedBills.length
  const canCreate = selectedStaffId && selectedPsids.size > 0

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="text-xs text-muted-foreground">
        {unassignedBills.length} unassigned bills · {selectedPsids.size} selected
      </div>

      {/* Bills table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <Loader2 className="size-4 mr-2 animate-spin" /> Loading bills...
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={onSelectAll}
                  />
                </TableHead>
                <TableHead>Consumer</TableHead>
                <TableHead>PSID</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Route</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unassignedBills.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    All bills in this UC have been assigned
                  </TableCell>
                </TableRow>
              ) : unassignedBills.map((b) => (
                <TableRow key={b.psid || b.survey_id} className="cursor-pointer" onClick={() => b.psid && onTogglePsid(b.psid)}>
                <TableCell>
                  <Checkbox
                    checked={!!b.psid && selectedPsids.has(b.psid)}
                    onCheckedChange={() => b.psid && onTogglePsid(b.psid)}
                  />
                </TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{b.consumer_name || '-'}</TableCell>
                  <TableCell className="text-xs font-mono">{b.psid?.slice(-8) || '-'}</TableCell>
                  <TableCell className="text-xs tabular-nums">{b.amount_due ? `Rs. ${b.amount_due.toLocaleString()}` : '-'}</TableCell>
                  <TableCell className="text-xs tabular-nums">{b.route_seq || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2 border-t">
        <Select value={selectedStaffId} onValueChange={onStaffChange}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Select staff..." />
          </SelectTrigger>
          <SelectContent>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.full_name || 'Unnamed'}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Assign first
          <Input
            type="number"
            min={1}
            max={unassignedBills.length}
            value={assignCount}
            onChange={(e) => onCountChange(Math.max(1, Math.min(unassignedBills.length, parseInt(e.target.value) || 1)))}
            className="w-16 h-7 text-xs text-center"
          />
          bills
        </div>

        <Button
          size="sm"
          disabled={!canCreate || isCreating}
          onClick={onCreate}
        >
          {isCreating ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <BadgePlus className="size-3.5 mr-1" />}
          Assign
        </Button>
      </div>
    </div>
  )
}

function ActiveAssignmentsView({
  assignments, isLoading, onRevoke, isRevoking,
}: {
  assignments: AssignmentWithStats[] | undefined
  isLoading: boolean
  onRevoke: (id: string) => void
  isRevoking: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        <Loader2 className="size-4 mr-2 animate-spin" /> Loading active assignments...
      </div>
    )
  }

  if (!assignments?.length) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        No assignments for today
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {assignments.map((a) => (
        <div key={a.id} className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium">{a.staff_name}</span>
              <span className="text-xs text-muted-foreground ml-2">{a.uc_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums font-medium">{a.completion_pct}%</span>
              <Button
                size="xs"
                variant="destructive"
                disabled={isRevoking}
                onClick={() => onRevoke(a.id)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>

          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${a.completion_pct}%` }}
            />
          </div>

          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>{a.delivered} delivered</span>
            <span>{a.missed} missed</span>
            <span className="text-muted-foreground/50">{a.pending} pending</span>
            <span className="ml-auto">/ {a.total_items} total</span>
          </div>
        </div>
      ))}
    </div>
  )
}
