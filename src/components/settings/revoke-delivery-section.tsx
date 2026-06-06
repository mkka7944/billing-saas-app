'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight, Loader2, RotateCcw, Search, UndoDot } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface RevocableItem {
  id: string
  psid: string
  status: 'delivered' | 'processing'
  delivered_at: string | null
  gps_lat: number | null
  gps_lng: number | null
  uc_name: string
  staff_name: string
  staff_id: string
}

interface GroupedData {
  [uc_name: string]: RevocableItem[]
}

export function RevokeDeliverySection() {
  const [grouped, setGrouped] = useState<GroupedData>({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<Set<string>>(new Set())
  const [expandedUc, setExpandedUc] = useState<string | null>(null)
  const confirm = useConfirm()
  const { toast } = useToast()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/revoke-delivery?grouped=true')
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      setGrouped(json.grouped || {})
      setTotal(json.total || 0)
    } catch {
      toast('Failed to load delivery data', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const revokeSingle = useCallback(async (item: RevocableItem) => {
    const ok = await confirm({
      title: 'Revoke Delivery',
      message: `Reset PSID ${item.psid} (${item.uc_name}) back to pending? Photo and delivery record will be deleted.`,
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
      if (!res.ok) throw new Error('Failed to revoke')
      toast(`PSID ${item.psid} revoked`, 'success')
      await fetchData()
    } catch {
      toast('Failed to revoke', 'error')
    } finally {
      setRevoking((prev) => { const next = new Set(prev); next.delete(item.id); return next })
    }
  }, [confirm, toast, fetchData])

  const revokeUc = useCallback(async (ucName: string, items: RevocableItem[]) => {
    const ok = await confirm({
      title: `Revoke All — ${ucName}`,
      message: `Reset all ${items.length} delivered/processing items in ${ucName} back to pending? Photos and delivery records will be deleted.`,
      confirmLabel: `Revoke All (${items.length})`,
      variant: 'destructive',
    })
    if (!ok) return

    setRevoking((prev) => new Set([...prev, ...items.map((i) => i.id)]))
    try {
      const res = await fetch('/api/admin/revoke-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uc_name: ucName }),
      })
      if (!res.ok) throw new Error('Failed to revoke')
      toast(`Revoked ${items.length} items in ${ucName}`, 'success')
      await fetchData()
    } catch {
      toast('Failed to revoke', 'error')
    } finally {
      setRevoking(new Set())
    }
  }, [confirm, toast, fetchData])

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading...
        </CardContent>
      </Card>
    )
  }

  if (total === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
          <Search className="h-8 w-8" />
          <p className="text-sm font-medium">No delivered or processing items</p>
          <p className="text-xs">All assignment items are in pending state.</p>
        </CardContent>
      </Card>
    )
  }

  const ucNames = Object.keys(grouped).sort()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{total} item{total !== 1 ? 's' : ''} to review</p>
        <Button size="sm" variant="outline" onClick={fetchData} disabled={loading}>
          <RotateCcw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      </div>

      {ucNames.map((ucName) => {
        const items = grouped[ucName]
        const delivered = items.filter((i) => i.status === 'delivered').length
        const processing = items.filter((i) => i.status === 'processing').length
        const isExpanded = expandedUc === ucName
        const isRevokingAll = items.some((i) => revoking.has(i.id)) && items.every((i) => revoking.has(i.id))

        return (
          <Card key={ucName}>
            <CardContent className="p-0">
              <button
                onClick={() => setExpandedUc(isExpanded ? null : ucName)}
                className="flex items-center gap-2 w-full p-3 text-left hover:bg-muted/50 transition-colors cursor-pointer"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <span className="text-sm font-semibold flex-1">{ucName}</span>
                <div className="flex items-center gap-1.5">
                  {delivered > 0 && <Badge variant="default" className="text-[10px]">{delivered} delivered</Badge>}
                  {processing > 0 && <Badge variant="secondary" className="text-[10px]">{processing} processing</Badge>}
                </div>
              </button>

              {isExpanded && (
                <div className="divide-y border-t">
                  {items.map((item) => {
                    const isRevoking = revoking.has(item.id)
                    return (
                      <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 pl-10">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">PSID {item.psid}</span>
                            <Badge
                              variant={item.status === 'delivered' ? 'default' : 'secondary'}
                              className="text-[10px]"
                            >
                              {item.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.staff_name}
                            {item.delivered_at && ` · ${new Date(item.delivered_at).toLocaleString()}`}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => revokeSingle(item)}
                          disabled={isRevoking}
                          className="h-8 text-xs shrink-0"
                        >
                          {isRevoking ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <UndoDot className="h-3 w-3 mr-1" />
                          )}
                          Revoke
                        </Button>
                      </div>
                    )
                  })}

                  {items.length > 1 && (
                    <div className="px-3 py-2 pl-10 border-t">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => revokeUc(ucName, items)}
                        disabled={isRevokingAll}
                        className="text-xs"
                      >
                        {isRevokingAll ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <UndoDot className="h-3 w-3 mr-1" />
                        )}
                        Revoke All ({items.length})
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
