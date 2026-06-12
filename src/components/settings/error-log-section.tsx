'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, AlertCircle, AlertTriangle, RefreshCw, Download, ChevronDown, ChevronRight, Copy, Check, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useToast } from '@/hooks/use-toast'

interface LogEntry {
  id: number
  level: 'error' | 'warn'
  user_id: string | null
  message: string
  details: Record<string, unknown> | null
  source: string | null
  created_at: string
}

interface StaffUser {
  id: string
  name: string
}

const UPLOAD_SOURCES = ['photo-queue', 'drive-upload', 'drive', 'upload', 'sync', 'gas', 'photo']

function sourceType(source: string | null): 'upload' | 'app' {
  if (!source) return 'app'
  return UPLOAD_SOURCES.includes(source) ? 'upload' : 'app'
}

export function ErrorLogSection({ isAdmin }: { isAdmin?: boolean }) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [offset, setOffset] = useState(0)
  const [levelFilter, setLevelFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'upload' | 'app'>('all')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [userIdFilter, setUserIdFilter] = useState('')
  const [staffList, setStaffList] = useState<StaffUser[]>([])
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const confirm = useConfirm()
  const { toast } = useToast()

  const copyToClipboard = useCallback(async (entry: LogEntry) => {
    try {
      await navigator.clipboard.writeText(`Error #${entry.id}: ${entry.message}`)
      setCopiedId(entry.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // silent
    }
  }, [])

  const fetchLogs = useCallback(async (append = false) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setOffset(0)
    }

    try {
      const params = new URLSearchParams({ limit: '50' })
      if (append) params.set('offset', String(offset))
      if (levelFilter) params.set('level', levelFilter)
      if (typeFilter !== 'all') {
        if (typeFilter === 'upload') {
          params.set('source', UPLOAD_SOURCES.join(','))
        } else {
          params.set('source', `!${UPLOAD_SOURCES.join(',')}`)
        }
      }
      if (userIdFilter && isAdmin) params.set('user_id', userIdFilter)

      const res = await fetch(`/api/log?${params}`)
      const json = await res.json()

      if (json.data) {
        if (append) {
          setLogs(prev => [...prev, ...json.data])
        } else {
          setLogs(json.data)
        }
        setTotal(json.total ?? 0)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [offset, levelFilter, typeFilter, userIdFilter, isAdmin])

  useEffect(() => {
    fetchLogs()
    if (isAdmin) {
      fetch('/api/admin/users')
        .then(r => r.json())
        .then(json => {
          if (json.data) {
            setStaffList(json.data.map((u: any) => ({
              id: u.id,
              name: u.displayName || u.username || u.id,
            })))
          }
        })
        .catch(() => {})
    }
  }, []) // only on mount

  const handleClear = async () => {
    const ok = await confirm({
      title: 'Clear all error logs?',
      message: 'This permanently deletes every entry. Cannot be undone.',
      confirmLabel: 'Clear all',
      variant: 'destructive',
    })
    if (!ok) return

    setClearing(true)
    try {
      const res = await fetch('/api/log', { method: 'DELETE' })
      if (res.ok) {
        setLogs([])
        setTotal(0)
        toast('All error logs cleared', 'success')
      } else {
        const j = await res.json()
        toast(j.error || 'Failed to clear', 'error')
      }
    } catch {
      toast('Network error', 'error')
    } finally {
      setClearing(false)
    }
  }

  const handleLoadMore = () => {
    setOffset(prev => prev + 50)
    fetchLogs(true)
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `error-log-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    const diff = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return d.toLocaleDateString()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{total} error{total !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          {isAdmin && total > 0 && (
            <button
              onClick={handleClear}
              disabled={clearing}
              className="h-7 px-2.5 text-[11px] font-medium rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-200 flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
            >
              {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Clear all
            </button>
          )}
          <button
            onClick={() => fetchLogs()}
            disabled={loading}
            className="h-7 px-2.5 text-[11px] font-medium rounded-lg bg-muted hover:bg-accent flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={logs.length === 0}
            className="h-7 px-2.5 text-[11px] font-medium rounded-lg bg-muted hover:bg-accent flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <Download className="h-3 w-3" />
            Export JSON
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {['', 'error', 'warn'].map(level => (
          <button
            key={level}
            onClick={() => setLevelFilter(level)}
            className={cn(
              'shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors cursor-pointer border',
              levelFilter === level
                ? level === 'warn' ? 'bg-amber-500/10 text-amber-600 border-amber-200' : 'bg-red-500/10 text-red-600 border-red-200'
                : level === '' ? 'bg-muted/50 text-foreground border-border' : 'text-muted-foreground border-transparent hover:bg-muted'
            )}
          >
            {level === 'error' ? 'Errors' : level === 'warn' ? 'Warnings' : 'All'}
          </button>
        ))}
        <span className="w-px h-5 bg-border mx-0.5 self-center" />
        {(['all', 'upload', 'app'] as const).map(type => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={cn(
              'shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors cursor-pointer border',
              typeFilter === type
                ? type === 'upload' ? 'bg-amber-500/10 text-amber-600 border-amber-200' : type === 'app' ? 'bg-blue-500/10 text-blue-600 border-blue-200' : 'bg-muted/50 text-foreground border-border'
                : 'text-muted-foreground border-transparent hover:bg-muted'
            )}
          >
            {type === 'upload' ? 'Upload' : type === 'app' ? 'App' : 'All Types'}
          </button>
        ))}
        {isAdmin && (
          <select
            value={userIdFilter}
            onChange={(e) => setUserIdFilter(e.target.value)}
            className="h-7 text-[10px] rounded-lg border border-border bg-background px-2 outline-none focus:ring-1 focus:ring-ring max-w-[140px]"
          >
            <option value="">All staff</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => fetchLogs()}
          disabled={loading}
          className="h-7 px-3 text-[10px] font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
        >
          Apply
        </button>
      </div>

      {/* List */}
      <div className="rounded-lg border divide-y divide-border">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading...
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">No errors logged</div>
        ) : (
          <>
            {logs.map(entry => (
              <div key={entry.id}>
                <button
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-accent/30 transition-colors cursor-pointer"
                >
                  <span className="shrink-0 mt-0.5">
                    {entry.level === 'warn' ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">
                      <span className="text-[10px] text-muted-foreground font-mono mr-1">#{entry.id}</span>
                      {entry.message}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{formatTime(entry.created_at)}</span>
                      {entry.source && (
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full font-mono',
                          sourceType(entry.source) === 'upload'
                            ? 'bg-amber-500/10 text-amber-600 border border-amber-200'
                            : 'bg-muted text-muted-foreground'
                        )}>
                          {sourceType(entry.source) === 'upload' ? 'Upload' : entry.source}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <span
                      onClick={(e) => { e.stopPropagation(); copyToClipboard(entry) }}
                      className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted cursor-pointer transition-colors"
                      title="Copy error ID"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyToClipboard(entry) }}}
                    >
                      {copiedId === entry.id ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      )}
                    </span>
                    {entry.details && (
                      <span className="text-muted-foreground">
                        {expandedId === entry.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </span>
                    )}
                  </div>
                </button>
                {expandedId === entry.id && entry.details && (
                  <div className="px-3 pb-2.5">
                    <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap font-mono">
                      {JSON.stringify(entry.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {logs.length < total && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="w-full h-9 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg border border-border hover:bg-accent flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
        >
          {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Load more ({total - logs.length} remaining)
        </button>
      )}
    </div>
  )
}
