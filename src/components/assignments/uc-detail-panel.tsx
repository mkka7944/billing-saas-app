'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUnassignedBills, useStaffList, useCreateAssignment } from '@/hooks/use-assignments'
import { currentMonth } from '@/lib/constants'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, X } from 'lucide-react'

interface Props {
  uc: string
  city: string | null
  routeName?: string
  onCreated: () => void
  onDirtyChange?: (dirty: boolean) => void
}

function parseRange(input: string, max: number): [number, number] | null {
  const m = input.match(/^(\d+)\s*-\s*(\d+)$/)
  if (!m) return null
  const from = parseInt(m[1], 10)
  const to = parseInt(m[2], 10)
  if (from < 1 || to > max || from > to) return null
  return [from - 1, to - 1]
}

export function UCDetailPanel({ uc, city, routeName, onCreated, onDirtyChange }: Props) {
  const { toast } = useToast()
  const month = currentMonth()
  const { data, isLoading, isError, error } = useUnassignedBills(uc, month, routeName)
  const { data: staffList } = useStaffList()
  const createAssignment = useCreateAssignment()
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([])
  const [rangeInput, setRangeInput] = useState('')
  const [targetPerDay, setTargetPerDay] = useState(0)
  const [page, setPage] = useState(0)

  const [selectedOrder, setSelectedOrder] = useState<string[]>([])
  const [staffDropdownOpen, setStaffDropdownOpen] = useState(false)
  const [assignProgress, setAssignProgress] = useState<{ current: number; total: number } | null>(null)

  useEffect(() => { setPage(0) }, [uc, routeName])
  useEffect(() => { onDirtyChange?.(selectedOrder.length > 0) }, [selectedOrder, onDirtyChange])

  const selectedSet = useMemo(() => new Set(selectedOrder), [selectedOrder])
  const selectedCount = selectedOrder.length

  const toggleId = useCallback((surveyId: string) => {
    setSelectedOrder((prev) =>
      prev.includes(surveyId) ? prev.filter((id) => id !== surveyId) : [...prev, surveyId]
    )
  }, [])

  const bills = data?.data || []
  const total = data?.total || 0
  const PAGE_SIZE = 50
  const totalPages = Math.max(1, Math.ceil(bills.length / PAGE_SIZE))
  const pageItems = bills.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const allOnPageSelected = pageItems.length > 0 && pageItems.every((b) => selectedSet.has(b.survey_id))
  const togglePage = useCallback(() => {
    if (allOnPageSelected) {
      const ids = new Set(pageItems.map((b) => b.survey_id))
      setSelectedOrder((prev) => prev.filter((id) => !ids.has(id)))
    } else {
      setSelectedOrder((prev) => {
        const existing = new Set(prev)
        const toAdd = pageItems.filter((b) => !existing.has(b.survey_id)).map((b) => b.survey_id)
        return toAdd.length ? [...prev, ...toAdd] : prev
      })
    }
  }, [allOnPageSelected, pageItems])

  const range = parseRange(rangeInput, bills.length)
  const rangeCount = range ? range[1] - range[0] + 1 : 0

  const filteredStaff = (staffList || []).filter(
    (s) => s.is_active && (!city || s.assigned_city === city)
  )

  const surveyToPsid = useMemo(() => {
    const map = new Map<string, string>()
    for (const b of bills) if (b.survey_id && b.psid) map.set(b.survey_id, b.psid)
    return map
  }, [bills])

  const runMultiStaff = async (psids: string[], routeSeqMap?: Record<string, number>) => {
    setAssignProgress({ current: 0, total: selectedStaffIds.length })
    let successCount = 0
    for (let i = 0; i < selectedStaffIds.length; i++) {
      setAssignProgress({ current: i + 1, total: selectedStaffIds.length })
      try {
        await createAssignment.mutateAsync({
          staff_id: selectedStaffIds[i],
          uc_name: uc,
          psids,
          bill_month: month,
          routeSeqMap,
          target_per_day: targetPerDay || undefined,
        })
        successCount++
      } catch {
        // continue with next staff
      }
    }
    setAssignProgress(null)
    return successCount
  }

  const handleCreate = async () => {
    if (!selectedStaffIds.length || !range) return
    const psids = bills.slice(range[0], range[1] + 1).map((b) => b.psid).filter(Boolean) as string[]
    if (!psids.length) return
    const successCount = await runMultiStaff(psids)
    if (successCount > 0) {
      setSelectedStaffIds([])
      setRangeInput('')
      onCreated()
      toast(`Assigned ${psids.length} bills to ${successCount} staff`, 'success')
    }
  }

  const handleCreateFullMC = async () => {
    if (!selectedStaffIds.length) return
    const psids = bills.map((b) => b.psid).filter(Boolean) as string[]
    if (!psids.length) return
    const successCount = await runMultiStaff(psids)
    if (successCount > 0) {
      setSelectedStaffIds([])
      setRangeInput('')
      onCreated()
      toast(`Assigned ${psids.length} bills to ${successCount} staff`, 'success')
    }
  }

  const handleCreateFromSelection = async () => {
    if (!selectedStaffIds.length || !selectedOrder.length) return
    const psids = selectedOrder.map((sid) => surveyToPsid.get(sid)).filter(Boolean) as string[]
    if (!psids.length) return
    const routeSeqMap: Record<string, number> = {}
    selectedOrder.forEach((sid, idx) => {
      const pid = surveyToPsid.get(sid)
      if (pid) routeSeqMap[pid] = idx + 1
    })
    const successCount = await runMultiStaff(psids, routeSeqMap)
    if (successCount > 0) {
      setSelectedStaffIds([])
      setSelectedOrder([])
      onCreated()
      toast(`Assigned ${psids.length} bills to ${successCount} staff`, 'success')
    }
  }

  const isWorking = assignProgress !== null
  const progressLabel = isWorking && assignProgress
    ? `${assignProgress.current}/${assignProgress.total} staff`
    : ''

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading PSIDs...
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-destructive">
        Failed to load bills — {error?.message || 'server error'}
      </div>
    )
  }

  if (!bills.length) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        All bills in {uc} have been assigned
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">{routeName ? `${uc} / ${routeName}` : uc}</h3>
        <div className="flex items-center gap-3">
          {selectedCount > 0 && (
            <>
              <button
                onClick={() => setSelectedOrder([])}
                className="p-1 rounded border border-red-200 hover:bg-red-50 transition-colors"
              ><X className="size-3 text-red-500" /></button>
              <span className="text-xs font-medium text-blue-600">{selectedCount} selected</span>
            </>
          )}
          <span className="text-xs text-muted-foreground">{total.toLocaleString()} unassigned bills</span>
        </div>
      </div>

      <Card className="flex-1 flex flex-col min-h-0">
        <CardContent className="p-0 flex flex-col min-h-0">
          <div className="overflow-x-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox checked={allOnPageSelected} onCheckedChange={togglePage} />
                  </TableHead>
                  <TableHead className="text-xs font-semibold w-8">#</TableHead>
                  <TableHead className="text-xs font-semibold">Survey ID</TableHead>
                  <TableHead className="text-xs font-semibold">Consumer</TableHead>
                  <TableHead className="text-xs font-semibold">Address</TableHead>
                  <TableHead className="text-xs font-semibold max-md:hidden">Surveyor</TableHead>
                  <TableHead className="text-xs font-semibold max-md:hidden">Date</TableHead>
                  <TableHead className="text-xs font-semibold max-md:hidden">Time</TableHead>
                  <TableHead className="text-xs font-semibold text-right w-16">Delivery #</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                      No bills match the current view
                    </TableCell>
                  </TableRow>
                ) : pageItems.map((b, i) => (
                  <TableRow key={b.survey_id}>
                    <TableCell>
                      <Checkbox checked={selectedSet.has(b.survey_id)} onCheckedChange={() => toggleId(b.survey_id)} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{page * PAGE_SIZE + i + 1}</TableCell>
                    <TableCell className="text-sm font-mono font-medium">{b.survey_id.slice(-8)}</TableCell>
                    <TableCell className="text-sm truncate max-w-[140px]">{b.consumer_name || '—'}</TableCell>
                    <TableCell className="text-sm truncate max-w-[180px] text-muted-foreground">{b.address || '—'}</TableCell>
                    <TableCell className="text-sm max-md:hidden text-muted-foreground truncate max-w-[100px]">{b.surveyor_name || '—'}</TableCell>
                    <TableCell className="text-sm max-md:hidden text-muted-foreground">{b.survey_date || '—'}</TableCell>
                    <TableCell className="text-sm max-md:hidden text-muted-foreground">{b.survey_time || '—'}</TableCell>
                    <TableCell className="text-sm text-right font-mono">
                      {selectedSet.has(b.survey_id) ? (
                        <input
                          type="number"
                          min={1}
                          max={selectedCount}
                          value={selectedOrder.indexOf(b.survey_id) + 1}
                          onChange={(e) => {
                            const pos = parseInt(e.target.value, 10)
                            if (!isNaN(pos) && pos >= 1 && pos <= selectedCount) {
                              setSelectedOrder((prev) => {
                                const idx = prev.indexOf(b.survey_id)
                                if (idx === -1 || idx === pos - 1) return prev
                                const next = [...prev]
                                next.splice(idx, 1)
                                next.splice(pos - 1, 0, b.survey_id)
                                return next
                              })
                            }
                          }}
                          className="w-10 h-6 text-xs text-center rounded border border-input bg-background font-mono"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="text-muted-foreground/50">{page * PAGE_SIZE + i + 1}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-2 border-t border-border">
              <button
                onClick={() => setPage(0)}
                disabled={page === 0}
                className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
              ><ChevronsLeft className="size-4" /></button>
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
              ><ChevronLeft className="size-4" /></button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, bills.length)} / {bills.length}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
              ><ChevronRight className="size-4" /></button>
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={page >= totalPages - 1}
                className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
              ><ChevronsRight className="size-4" /></button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-border bg-background">
        <div className="relative">
          <button
            onClick={() => setStaffDropdownOpen((v) => !v)}
            onBlur={() => setTimeout(() => setStaffDropdownOpen(false), 200)}
            className="h-8 px-2.5 text-xs font-medium rounded-md border border-input bg-background hover:bg-accent transition-colors flex items-center gap-1"
          >
            Staff
            {selectedStaffIds.length > 0 && <span className="text-blue-500">({selectedStaffIds.length})</span>}
            <ChevronDown className="size-3 opacity-50" />
          </button>
          {staffDropdownOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 border rounded-lg bg-popover shadow-xl max-h-48 overflow-y-auto z-30 min-w-[180px] p-1.5">
              {filteredStaff.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No staff</p>
              )}
              {filteredStaff.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-xs"
                >
                  <Checkbox
                    checked={selectedStaffIds.includes(s.id)}
                    onCheckedChange={() => {
                      setSelectedStaffIds((prev) =>
                        prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                      )
                    }}
                  />
                  <span className="truncate">{s.full_name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <input
          value={rangeInput}
          onChange={(e) => setRangeInput(e.target.value)}
          placeholder="1–200"
          className="h-8 w-20 px-2 text-xs rounded-md border border-input bg-background font-mono"
          title={rangeCount > 0 ? `${rangeCount} selected` : 'Range e.g. 1–200'}
        />

        <input
          type="number"
          min={0}
          value={targetPerDay}
          onChange={(e) => setTargetPerDay(Math.max(0, parseInt(e.target.value) || 0))}
          placeholder="daily"
          className="h-8 w-16 px-2 text-xs rounded-md border border-input bg-background font-mono"
          title="Daily target"
        />

        {selectedCount > 0 && (
          <button
            onClick={handleCreateFromSelection}
            disabled={!selectedStaffIds.length || isWorking}
            className="h-8 px-3 rounded-md text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {progressLabel || `Selected (${selectedCount})`}
          </button>
        )}

        <button
          onClick={handleCreateFullMC}
          disabled={!selectedStaffIds.length || isWorking}
          className="h-8 px-3 rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {progressLabel || 'Full MC'}
        </button>

        <button
          onClick={handleCreate}
          disabled={!selectedStaffIds.length || !range || isWorking}
          className="h-8 px-3 rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {progressLabel || 'Assign'}
        </button>
      </div>

      {createAssignment.isError && (
        <p className="text-xs text-destructive mt-1">{(createAssignment.error as Error).message}</p>
      )}
    </div>
  )
}
