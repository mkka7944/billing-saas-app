'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup } from '@/components/ui/select'
import { Loader2, RotateCcw, UndoDot, Search, ChevronUp, ChevronDown } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface DeliveryItem {
  id: string
  psid: string | null
  survey_id: string | null
  consumer_name: string | null
  address: string | null
  portal_lat: number | null
  portal_lng: number | null
  status: string
  started_at: string | null
  delivered_at: string | null
  gps_lat: number | null
  gps_lng: number | null
  photo_url: string | null
  photo_captured_at: string | null
  uc_name: string
  staff_name: string
  staff_id: string
  flagged_reason: string | null
}

interface DeliveryTableData {
  items: DeliveryItem[]
  total: number
}

type SortKey = keyof DeliveryItem | 'distance'
type SortDir = 'asc' | 'desc'

export function DeliveryTable() {
  const [data, setData] = useState<DeliveryTableData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [ucFilter, setUcFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('delivered_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [revoking, setRevoking] = useState<Set<string>>(new Set())
  const [accepting, setAccepting] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [ucList, setUcList] = useState<string[]>([])
  const confirm = useConfirm()
  const { toast } = useToast()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      if (ucFilter) params.set('uc_name', ucFilter)
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/admin/revoke-delivery?${params}`)
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      setData(json)
      setSelected(new Set())

      const ucs = [...new Set<string>((json.items || []).map((i: DeliveryItem) => i.uc_name))]
      if (!ucFilter && ucs.length > 0 && ucList.length === 0) {
        setUcList(ucs.sort())
      }
    } catch {
      toast('Failed to load delivery data', 'error')
    } finally {
      setLoading(false)
    }
  }, [search, ucFilter, statusFilter, toast])

  useEffect(() => { fetchData() }, [fetchData])

  const displayItems = useMemo(() => {
    if (!data?.items) return []
    const list = [...data.items]
    list.sort((a, b) => {
      let av: unknown = a[sortKey as keyof DeliveryItem]
      let bv: unknown = b[sortKey as keyof DeliveryItem]
      if (sortKey === 'distance') {
        av = a.gps_lat != null && a.portal_lat != null ? calcDistance(a) : -1
        bv = b.gps_lat != null && b.portal_lat != null ? calcDistance(b) : -1
      }
      if (av == null) av = ''
      if (bv == null) bv = ''
      const cmp = typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av) - Number(bv)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [data, sortKey, sortDir])

  function calcDistance(item: DeliveryItem): number {
    if (item.gps_lat == null || item.gps_lng == null || item.portal_lat == null || item.portal_lng == null) return -1
    const R = 6371000
    const toRad = (d: number) => (d * Math.PI) / 180
    const dLat = toRad(item.gps_lat - item.portal_lat)
    const dLng = toRad(item.gps_lng - item.portal_lng)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(item.portal_lat)) * Math.cos(toRad(item.gps_lat)) * Math.sin(dLng / 2) ** 2
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
  }

  function fmtDuration(started: string | null, delivered: string | null): string {
    if (!started) return '—'
    const s = new Date(started).getTime()
    const e = delivered ? new Date(delivered).getTime() : Date.now()
    const diffMs = e - s
    if (diffMs < 1000) return '<1s'
    const secs = Math.floor(diffMs / 1000)
    if (secs < 60) return `${secs}s`
    return `${Math.floor(secs / 60)}m ${secs % 60}s`
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === displayItems.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(displayItems.map((i) => i.id)))
    }
  }

  const handleRevoke = useCallback(async (item: DeliveryItem) => {
    const ok = await confirm({
      title: 'Revoke Delivery',
      message: `Reset ${item.consumer_name || item.psid || item.survey_id} (${item.uc_name}) back to pending? Photo and delivery record will be deleted.`,
      confirmLabel: 'Revoke',
      variant: 'destructive',
    })
    if (!ok) return

    setRevoking((prev) => new Set(prev).add(item.id))
    try {
      const res = await fetch('/api/admin/revoke-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_item_id: item.id }),
      })
      if (!res.ok) throw new Error('Failed')
      toast(`Revoked — ${item.consumer_name || item.psid}`, 'success')
      setSelected((prev) => { const next = new Set(prev); next.delete(item.id); return next })
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          items: prev.items.map((i) =>
            i.id === item.id
              ? { ...i, status: 'pending', started_at: null, delivered_at: null, gps_lat: null, gps_lng: null, photo_url: null }
              : i
          ),
        }
      })
    } catch {
      toast('Failed to revoke', 'error')
    } finally {
      setRevoking((prev) => { const next = new Set(prev); next.delete(item.id); return next })
    }
  }, [confirm, toast])

  const handleBulkRevoke = useCallback(async () => {
    if (selected.size === 0) return
    const names = displayItems.filter((i) => selected.has(i.id)).map((i) => i.consumer_name || i.psid || i.survey_id)
    const ok = await confirm({
      title: `Revoke ${selected.size} Deliveries`,
      message: `Reset ${selected.size} delivered/processing items back to pending? Photos and delivery records will be deleted.\n\n${names.slice(0, 5).join(', ')}${names.length > 5 ? ` and ${names.length - 5} more` : ''}`,
      confirmLabel: `Revoke All (${selected.size})`,
      variant: 'destructive',
    })
    if (!ok) return

    const itemIds = [...selected]
    setRevoking(new Set(itemIds))
    try {
      const res = await fetch('/api/admin/revoke-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: itemIds }),
      })
      if (!res.ok) throw new Error('Failed')
      toast(`Revoked ${selected.size} items`, 'success')
      const revokedIds = new Set(itemIds)
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          items: prev.items.map((i) =>
            revokedIds.has(i.id)
              ? { ...i, status: 'pending', started_at: null, delivered_at: null, gps_lat: null, gps_lng: null, photo_url: null }
              : i
          ),
        }
      })
      setSelected(new Set())
    } catch {
      toast('Failed to revoke selected items', 'error')
    } finally {
      setRevoking(new Set())
    }
  }, [selected, displayItems, confirm, toast])

  const handleAccept = useCallback(async (item: DeliveryItem) => {
    const ok = await confirm({
      title: 'Accept as Delivered',
      message: `Mark "${item.consumer_name || item.psid || item.survey_id}" (${item.uc_name}) as delivered? GPS and timestamp will be preserved.`,
      confirmLabel: 'Accept',
      variant: 'default',
    })
    if (!ok) return

    setAccepting((prev) => new Set(prev).add(item.id))
    try {
      const res = await fetch('/api/admin/accept-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_item_id: item.id }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error || 'Failed')
      }
      toast(`Accepted — ${item.consumer_name || item.psid}`, 'success')
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          items: prev.items.map((i) =>
            i.id === item.id ? { ...i, status: 'delivered' } : i
          ),
        }
      })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to accept', 'error')
    } finally {
      setAccepting((prev) => { const next = new Set(prev); next.delete(item.id); return next })
    }
  }, [confirm, toast])

  const allSelected = displayItems.length > 0 && selected.size === displayItems.length
  const someSelected = selected.size > 0 && selected.size < displayItems.length
  const isBulkRevoking = revoking.size > 0

  const fmtCoord = (v: number | null) => v != null ? v.toFixed(5) : '—'
  const fmtTime = (iso: string | null) => iso ? new Date(iso).toLocaleString() : '—'

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Checkbox
          checked={allSelected}
          data-state={someSelected ? 'indeterminate' : allSelected ? 'checked' : 'unchecked'}
          onCheckedChange={() => toggleSelectAll()}
          className="shrink-0"
        />
        <div className="relative flex-1 min-w-[140px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search PSID, name, SID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <Select value={ucFilter || '__all__'} onValueChange={(v) => setUcFilter(v === '__all__' ? '' : (v ?? ''))}>
          <SelectTrigger className="w-[150px] h-9 text-xs">
            <SelectValue placeholder="All UCs" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="__all__">All UCs</SelectItem>
              {ucList.map((uc) => (
                <SelectItem key={uc} value={uc}>{uc}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={statusFilter || '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : (v ?? ''))}>
          <SelectTrigger className="w-[130px] h-9 text-xs">
            <SelectValue placeholder="All status" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="__all__">All status</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={fetchData} disabled={loading} className="h-9 px-2 shrink-0">
          <RotateCcw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{data?.total || 0} results</span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="destructive"
          onClick={handleBulkRevoke}
          disabled={selected.size === 0 || isBulkRevoking}
          className={cn('h-9 text-xs shrink-0 transition-opacity', selected.size === 0 && 'opacity-40')}
        >
          {isBulkRevoking ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <UndoDot className="h-3 w-3 mr-1" />}
          Revoke Selected{selected.size > 0 ? ` (${selected.size})` : ''}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading...
        </div>
      ) : displayItems.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          No delivery records found
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[11px]">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      data-state={someSelected ? 'indeterminate' : allSelected ? 'checked' : 'unchecked'}
                      onCheckedChange={() => toggleSelectAll()}
                    />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('survey_id')}>
                    SID <SortIcon col="survey_id" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('psid')}>
                    PSID <SortIcon col="psid" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('consumer_name')}>
                    Consumer <SortIcon col="consumer_name" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap">Address</TableHead>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('portal_lat')}>
                    Portal Coords <SortIcon col="portal_lat" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap">Saved Coords</TableHead>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('distance')}>
                    Dist. <SortIcon col="distance" />
                  </TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Photo</TableHead>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('delivered_at')}>
                    Date/Time <SortIcon col="delivered_at" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('staff_name')}>
                    Staff <SortIcon col="staff_name" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('uc_name')}>
                    UC <SortIcon col="uc_name" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap">Status</TableHead>
                  <TableHead className="w-10">Flag</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayItems.map((item) => {
                  const isRevoking = revoking.has(item.id)
                  const dist = calcDistance(item)
                  const isSelected = selected.has(item.id)
                  return (
                    <TableRow key={item.id} className={cn('text-xs cursor-pointer', isSelected && 'bg-muted/50')} onClick={() => toggleSelect(item.id)}>
                      <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(item.id)} />
                      </TableCell>
                      <TableCell className="font-mono text-[10px] max-w-[70px] truncate">{item.survey_id || '—'}</TableCell>
                      <TableCell className="font-mono text-[10px]">{item.psid || '—'}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap max-w-[120px] truncate">{item.consumer_name || '—'}</TableCell>
                      <TableCell className="max-w-[150px] truncate text-muted-foreground">{item.address || '—'}</TableCell>
                      <TableCell className="font-mono text-[10px] whitespace-nowrap text-muted-foreground">
                        {item.portal_lat != null ? `${fmtCoord(item.portal_lat)}, ${fmtCoord(item.portal_lng)}` : '—'}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] whitespace-nowrap text-muted-foreground">
                        {item.gps_lat != null ? `${fmtCoord(item.gps_lat)}, ${fmtCoord(item.gps_lng)}` : '—'}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] whitespace-nowrap">
                        {dist >= 0 ? <span className={dist <= 50 ? 'text-green-600' : dist <= 200 ? 'text-amber-600' : 'text-red-600'}>{dist}m</span> : '—'}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] whitespace-nowrap text-muted-foreground">
                        {fmtDuration(item.started_at, item.delivered_at)}
                      </TableCell>
                      <TableCell>
                        {item.photo_url && !item.photo_url.startsWith('pending://') ? (
                          <img
                            src={item.photo_url}
                            alt=""
                            className="w-8 h-8 rounded object-cover border"
                            onError={(e) => {
                              const el = e.target as HTMLImageElement
                              el.style.display = 'none'
                              el.nextElementSibling?.classList.remove('hidden')
                            }}
                          />
                        ) : item.photo_url?.startsWith('pending://') ? (
                          <span className="text-[9px] text-amber-500 font-medium">Pending</span>
                        ) : (
                          <span className="text-[9px] text-muted-foreground">—</span>
                        )}
                        <span className="hidden text-[9px] text-muted-foreground">☁</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{fmtTime(item.delivered_at)}</TableCell>
                      <TableCell className="whitespace-nowrap max-w-[100px] truncate">{item.staff_name}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{item.uc_name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={item.status === 'delivered' ? 'default' : 'secondary'}
                          className="text-[10px]"
                        >
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.flagged_reason ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-medium text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded-full whitespace-nowrap" title={item.flagged_reason.replace(/_/g, ' ')}>
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                            {item.flagged_reason}
                          </span>
                        ) : (
                          <span className="text-[9px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.status === 'processing' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); handleAccept(item) }}
                            disabled={accepting.has(item.id)}
                            className="h-7 text-[10px] px-2 whitespace-nowrap"
                          >
                            {accepting.has(item.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Accept'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {displayItems.map((item) => {
              const isRevoking = revoking.has(item.id)
              const dist = calcDistance(item)
              const isSelected = selected.has(item.id)
              return (
                <div
                  key={item.id}
                  className={cn('rounded-lg border p-3 space-y-1.5 cursor-pointer transition-colors', isSelected && 'border-primary bg-primary/5')}
                  onClick={() => toggleSelect(item.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(item.id)} className="mr-1" />
                        <span className="text-sm font-semibold truncate">{item.consumer_name || 'Unknown'}</span>
                        <Badge variant={item.status === 'delivered' ? 'default' : 'secondary'} className="text-[9px] shrink-0">
                          {item.status}
                        </Badge>
                        {item.flagged_reason && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-medium text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded-full shrink-0" title={item.flagged_reason.replace(/_/g, ' ')}>
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                            {item.flagged_reason}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{item.address || '—'}</p>
                    </div>
                    {item.photo_url && !item.photo_url.startsWith('pending://') ? (
                      <img src={item.photo_url} alt="" className="w-10 h-10 rounded object-cover border shrink-0" />
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span>PSID: <span className="font-mono text-foreground">{item.psid || '—'}</span></span>
                    <span>SID: <span className="font-mono text-foreground">{item.survey_id || '—'}</span></span>
                    <span>Staff: <span className="text-foreground">{item.staff_name}</span></span>
                    <span>UC: <span className="text-foreground">{item.uc_name}</span></span>
                    <span>Portal: {item.portal_lat != null ? `${fmtCoord(item.portal_lat)}, ${fmtCoord(item.portal_lng)}` : '—'}</span>
                    <span>Saved: {item.gps_lat != null ? `${fmtCoord(item.gps_lat)}, ${fmtCoord(item.gps_lng)}` : '—'}</span>
                    <span className="col-span-full">Distance: {dist >= 0 ? <span className={dist <= 50 ? 'text-green-600' : dist <= 200 ? 'text-amber-600' : 'text-red-600'}>{dist}m</span> : '—'}</span>
                    <span className="col-span-full">Delivered: {fmtTime(item.delivered_at)}</span>
                    <span className="col-span-full">Duration: {fmtDuration(item.started_at, item.delivered_at)}</span>
                  </div>
                  {isRevoking && (
                    <div className="flex justify-center pt-1 text-[10px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />Revoking...
                    </div>
                  )}
                  {item.status === 'processing' && !isRevoking && (
                    <div className="flex justify-end pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); handleAccept(item) }}
                        disabled={accepting.has(item.id)}
                        className="h-7 text-[10px]"
                      >
                        {accepting.has(item.id) ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        {accepting.has(item.id) ? 'Accepting...' : 'Accept as Delivered'}
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
