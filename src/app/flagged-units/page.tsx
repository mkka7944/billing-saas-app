'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { AppShell } from '@/components/layout/AppShell'
import { PaginationBar } from '@/components/pagination-bar'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  useFlaggedPsids, useFlaggedPsidsStats, useResolveFlagged,
  type FlaggedPsidEntry,
} from '@/hooks/use-admin-flagged-psids'
import {
  AlertCircle, CheckCircle2, Clock, FileEdit, Loader2, Search, XCircle,
  Ban, Trash2, UserX, Flag, Hash, HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const REASON_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  field_deleted: {
    label: 'Field Deleted',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    icon: <UserX className="h-3 w-3" />,
  },
  portal_deleted: {
    label: 'Portal Deleted',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    icon: <Trash2 className="h-3 w-3" />,
  },
  psid_duplicate_orphan: {
    label: 'Dup Orphan',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    icon: <HelpCircle className="h-3 w-3" />,
  },
  psid_duplicate_superseded: {
    label: 'Dup Superseded',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  psid_duplicate_monthly: {
    label: 'Dup Pending',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    icon: <Clock className="h-3 w-3" />,
  },
  staff_flagged: {
    label: 'Staff Flagged',
    color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
    icon: <Flag className="h-3 w-3" />,
  },
  admin_flagged: {
    label: 'Admin Flagged',
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
    icon: <Ban className="h-3 w-3" />,
  },
}

const PAGE_SIZE = 25

export default function FlaggedUnitsPage() {
  const roleName = useAuthStore((s) => s.roleName)
  const setPageIdentity = useBillingUIStore((s) => s.setPageIdentity)

  const [page, setPage] = useState(1)
  const [reasonFilter, setReasonFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [noteModal, setNoteModal] = useState<FlaggedPsidEntry | null>(null)
  const [noteText, setNoteText] = useState('')
  const [keeperModal, setKeeperModal] = useState<{
    entry: FlaggedPsidEntry
    siblings: FlaggedPsidEntry[]
  } | null>(null)

  useEffect(() => { setPageIdentity('Flagged Units') }, [setPageIdentity])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading } = useFlaggedPsids({
    page,
    pageSize: PAGE_SIZE,
    reason: reasonFilter || undefined,
    city: cityFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: debouncedSearch || undefined,
  })

  const { data: stats } = useFlaggedPsidsStats()
  const resolveMutation = useResolveFlagged()

  if (roleName !== 'admin' && roleName !== 'super_admin') {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-muted-foreground">Access denied. Admin only.</p>
        </div>
      </AppShell>
    )
  }

  async function handleResolve(id: number) {
    resolveMutation.mutate({ id, resolved: true })
  }

  async function handleSaveNote() {
    if (!noteModal) return
    resolveMutation.mutate(
      { id: noteModal.id, notes: noteText || null },
      { onSuccess: () => setNoteModal(null) }
    )
  }

  async function handleConfirmKeeper(keeperPsid: string) {
    if (!keeperModal) return
    resolveMutation.mutate(
      { id: keeperModal.entry.id, resolution: 'confirmed_valid' },
    )
    const surplus = keeperModal.siblings.filter((s) => s.psid !== keeperPsid)
    for (const s of surplus) {
      resolveMutation.mutate({ id: s.id, resolution: 'confirmed_duplicate', resolved: true })
    }
    setKeeperModal(null)
  }

  const totalPages = Math.ceil((data?.total || 0) / PAGE_SIZE)

  const reasonCounts = useMemo(() => {
    if (!stats?.byReason) return []
    return stats.byReason.filter((r) => r.count > 0)
  }, [stats])

  return (
    <AppShell>
      <div className="flex-1 flex flex-col">
        {/* KPI bar */}
        {stats && (
          <div className="shrink-0 px-4 py-3 border-b">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-bold">{stats.totalUnresolved.toLocaleString()} unresolved</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {reasonCounts.map((r) => {
                const cfg = REASON_CONFIG[r.reason]
                if (!cfg) return null
                return (
                  <button
                    key={r.reason}
                    onClick={() => setReasonFilter(reasonFilter === r.reason ? '' : r.reason)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer',
                      cfg.color,
                      reasonFilter === r.reason && 'ring-2 ring-ring',
                    )}
                  >
                    {cfg.icon}
                    <span>{cfg.label}</span>
                    <span className="tabular-nums">{r.count.toLocaleString()}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="shrink-0 px-4 py-3 border-b flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search PSID, ID, notes..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <select
            value={cityFilter}
            onChange={(e) => { setCityFilter(e.target.value); setPage(1) }}
            className="h-9 px-3 rounded-lg border border-border bg-background text-xs font-medium outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Cities</option>
            {stats?.cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className="h-9 px-3 rounded-lg border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-ring"
            placeholder="From"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            className="h-9 px-3 rounded-lg border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-ring"
            placeholder="To"
          />
          {reasonFilter && (
            <button
              onClick={() => setReasonFilter('')}
              className="h-9 px-3 rounded-lg border border-border text-xs font-medium hover:bg-muted cursor-pointer"
            >
              Clear filter
            </button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PSID</TableHead>
                  <TableHead>Survey ID</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>City / Tehsil</TableHead>
                  <TableHead>Flagged</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((entry) => {
                  const cfg = REASON_CONFIG[entry.reason]
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">{entry.psid}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.survey_id || '—'}
                      </TableCell>
                      <TableCell>
                        {cfg ? (
                          <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold', cfg.color)}>
                            {cfg.icon}
                            {cfg.label}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{entry.reason}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[entry.city_district, entry.tehsil].filter(Boolean).join(' / ') || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {entry.flagged_at
                          ? new Date(entry.flagged_at).toLocaleDateString()
                          : '—'}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <span className="text-xs text-muted-foreground truncate block">
                          {entry.notes || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {entry.resolved_at ? (
                            <span className="text-[10px] text-green-600 dark:text-green-300 font-medium">
                              Resolved
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => handleResolve(entry.id)}
                                disabled={resolveMutation.isPending}
                                className="h-7 px-2 rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-[10px] font-semibold hover:bg-green-200 dark:hover:bg-green-900/50 cursor-pointer disabled:opacity-50"
                                title="Resolve"
                              >
                                Resolve
                              </button>
                              <button
                                onClick={() => { setNoteModal(entry); setNoteText(entry.notes || '') }}
                                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground cursor-pointer"
                                title="Edit notes"
                              >
                                <FileEdit className="h-3.5 w-3.5" />
                              </button>
                              {entry.reason.startsWith('psid_duplicate') && (
                                <button
                                  onClick={async () => {
                                    const res = await fetch(`/api/admin/flagged-psids?psid=${entry.psid}&unresolvedOnly=true&pageSize=50`)
                                    const json = await res.json()
                                    const siblings = (json.data || []).filter((e: FlaggedPsidEntry) => e.id !== entry.id)
                                    setKeeperModal({ entry, siblings })
                                  }}
                                  className="h-7 px-2 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-semibold hover:bg-blue-200 dark:hover:bg-blue-900/50 cursor-pointer"
                                  title="Confirm keeper PSID"
                                >
                                  Keeper
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {(!data?.data || data.data.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-sm text-muted-foreground">
                      {search || reasonFilter || cityFilter || dateFrom
                        ? 'No results match your filters.'
                        : 'No flagged units found.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        {data && totalPages > 1 && (
          <PaginationBar
            page={page}
            totalPages={totalPages}
            totalRecords={data.total}
            onPageChange={setPage}
          />
        )}
      </div>

      {/* Note modal */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={() => setNoteModal(null)}>
          <div className="w-full max-w-sm bg-background rounded-t-xl sm:rounded-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Edit Notes</h2>
              <button className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-muted cursor-pointer text-sm" onClick={() => setNoteModal(null)}>✕</button>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{noteModal.psid}</span> — {REASON_CONFIG[noteModal.reason]?.label || noteModal.reason}
            </p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add notes..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-ring resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setNoteModal(null)}
                className="flex-1 h-9 rounded-lg border border-border text-xs font-medium hover:bg-muted cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNote}
                disabled={resolveMutation.isPending}
                className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keeper modal */}
      {keeperModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={() => setKeeperModal(null)}>
          <div className="w-full max-w-md bg-background rounded-t-xl sm:rounded-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Confirm Keeper PSID</h2>
              <button className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-muted cursor-pointer text-sm" onClick={() => setKeeperModal(null)}>✕</button>
            </div>
            <p className="text-xs text-muted-foreground">
              Select the PSID that should be kept. The surplus will be resolved as duplicates.
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {[keeperModal.entry, ...keeperModal.siblings].map((e) => (
                <label
                  key={e.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="keeper"
                    defaultChecked={e.id === keeperModal.entry.id}
                    className="h-4 w-4 accent-primary"
                    onClick={() => handleConfirmKeeper(e.psid)}
                  />
                  <div className="min-w-0">
                    <span className="text-sm font-mono font-medium">{e.psid}</span>
                    <span className="text-xs text-muted-foreground ml-2">{REASON_CONFIG[e.reason]?.label}</span>
                    <p className="text-[10px] text-muted-foreground truncate">{e.notes || 'No notes'}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setKeeperModal(null)}
                className="flex-1 h-9 rounded-lg border border-border text-xs font-medium hover:bg-muted cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
