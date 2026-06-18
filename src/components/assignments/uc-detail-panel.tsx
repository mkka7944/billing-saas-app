'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUnassignedBills, useStaffList, useCreateAssignment } from '@/hooks/use-assignments'
import { currentMonth } from '@/lib/constants'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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
  const month = currentMonth()
  const { data, isLoading } = useUnassignedBills(uc, month, routeName)
  const { data: staffList } = useStaffList()
  const createAssignment = useCreateAssignment()
  const [selectedStaff, setSelectedStaff] = useState('')
  const [rangeInput, setRangeInput] = useState('')
  const [targetPerDay, setTargetPerDay] = useState(0)
  const [page, setPage] = useState(0)

  const [selectedOrder, setSelectedOrder] = useState<string[]>([])
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

  const handleCreate = async () => {
    if (!selectedStaff || !range) return
    const psids = bills.slice(range[0], range[1] + 1).map((b) => b.psid).filter(Boolean) as string[]
    if (!psids.length) return
    try {
      await createAssignment.mutateAsync({
        staff_id: selectedStaff,
        uc_name: uc,
        psids,
        bill_month: month,
        target_per_day: targetPerDay || undefined,
      })
      setSelectedStaff('')
      setRangeInput('')
      onCreated()
    } catch {
      // error handled by mutation
    }
  }

  const handleCreateFromSelection = async () => {
    if (!selectedStaff || !selectedOrder.length) return
    const psids = selectedOrder.map((sid) => surveyToPsid.get(sid)).filter(Boolean) as string[]
    if (!psids.length) return
    const routeSeqMap: Record<string, number> = {}
    selectedOrder.forEach((sid, idx) => {
      const pid = surveyToPsid.get(sid)
      if (pid) routeSeqMap[pid] = idx + 1
    })
    try {
      await createAssignment.mutateAsync({
        staff_id: selectedStaff,
        uc_name: uc,
        psids,
        bill_month: month,
        routeSeqMap,
        target_per_day: targetPerDay || undefined,
      })
      setSelectedStaff('')
      setSelectedOrder([])
      onCreated()
    } catch {
      // error handled by mutation
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading PSIDs...
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
            <span className="text-xs font-medium text-blue-600">{selectedCount} selected</span>
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
                  <TableHead className="text-xs font-semibold text-right w-14">Seq</TableHead>
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
                    <TableCell className="text-sm text-right font-mono text-muted-foreground">
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
                        b.route_seq ?? '—'
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
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 pt-3 border-t border-border bg-background">
        <div className="flex-1">
          <label className="block text-xs text-muted-foreground mb-1">Assign to</label>
          <Select value={selectedStaff} onValueChange={(v) => v && setSelectedStaff(v)}>
            <SelectTrigger className="w-full h-8">
              <span className="flex flex-1 text-left truncate">
                {selectedStaff ? (filteredStaff.find(s => s.id === selectedStaff)?.full_name || 'Select staff...') : 'Select staff...'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {filteredStaff.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-20">
          <label className="block text-xs text-muted-foreground mb-1">Daily target</label>
          <input
            type="number"
            min={0}
            value={targetPerDay}
            onChange={(e) => setTargetPerDay(Math.max(0, parseInt(e.target.value) || 0))}
            placeholder="0"
            className="w-full h-8 px-2 text-sm rounded-md border border-input bg-background font-mono"
          />
        </div>
        <div className="w-full sm:w-44">
          <label className="block text-xs text-muted-foreground mb-1">
            Range {rangeCount > 0 && <span className="text-blue-500 font-medium">({rangeCount} selected)</span>}
          </label>
          <input
            value={rangeInput}
            onChange={(e) => setRangeInput(e.target.value)}
            placeholder="e.g. 1–200"
            className="w-full h-8 px-2 text-sm rounded-md border border-input bg-background font-mono"
          />
        </div>
        <div className="flex gap-2">
          {selectedCount > 0 && (
            <button
              onClick={handleCreateFromSelection}
              disabled={!selectedStaff || createAssignment.isPending}
              className="h-8 px-4 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {createAssignment.isPending ? 'Creating...' : `Assign Selected (${selectedCount})`}
            </button>
          )}
          <button
            onClick={handleCreate}
            disabled={!selectedStaff || !range || createAssignment.isPending}
            className="h-8 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {createAssignment.isPending ? 'Creating...' : 'Assign'}
          </button>
        </div>
      </div>

      {createAssignment.isError && (
        <p className="text-xs text-destructive mt-1">{(createAssignment.error as Error).message}</p>
      )}
    </div>
  )
}
