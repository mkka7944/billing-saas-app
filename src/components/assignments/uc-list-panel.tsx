'use client'

import { useMemo } from 'react'
import type { UCStatRow } from '@/lib/queries/hierarchy'

interface Props {
  ucStats: UCStatRow[]
  selectedUc: string | null
  onSelect: (uc: string) => void
  search?: string
}

function ucGroup(uc_name: string): number {
  if (uc_name.startsWith('MC')) return 0
  if (uc_name.startsWith('UC')) return 1
  return 2
}

function ucSortKey(a: UCStatRow, b: UCStatRow): number {
  const g = ucGroup(a.uc_name) - ucGroup(b.uc_name)
  if (g !== 0) return g
  const aN = parseInt(a.uc_name.match(/\d+/)?.[0] || '0', 10)
  const bN = parseInt(b.uc_name.match(/\d+/)?.[0] || '0', 10)
  return aN - bN
}

const GROUP_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'Municipal Committees', color: 'bg-blue-500' },
  1: { label: 'Union Councils', color: 'bg-emerald-500' },
  2: { label: 'Other', color: 'bg-neutral-500' },
}

export function UCListPanel({ ucStats, selectedUc, onSelect, search }: Props) {
  const filtered = useMemo(
    () => search ? ucStats.filter((u) => u.uc_name.toLowerCase().includes(search.toLowerCase())) : ucStats,
    [ucStats, search]
  )

  const grouped = useMemo(() => {
    const sorted = [...filtered].sort(ucSortKey)
    const groups: { label: string; color: string; items: UCStatRow[] }[] = []
    let currentGroup = -1
    for (const uc of sorted) {
      const g = ucGroup(uc.uc_name)
      if (g !== currentGroup) {
        groups.push({ ...GROUP_LABELS[g], items: [] })
        currentGroup = g
      }
      groups[groups.length - 1].items.push(uc)
    }
    return groups
  }, [filtered])

  if (!filtered.length) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-neutral-400">
        No UCs found
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {grouped.map((group) => (
        <div key={group.label}>
          <div className="flex items-center gap-1.5 px-1 mb-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${group.color}`} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{group.label}</span>
          </div>
          <div className="space-y-0.5">
            {group.items.map((uc) => {
              const pct = uc.total_units > 0 ? Math.round((uc.assigned_today / uc.total_units) * 100) : 0
              const isSelected = uc.uc_name === selectedUc

              return (
                <button
                  key={uc.uc_name}
                  onClick={() => onSelect(uc.uc_name)}
                  className={`w-full text-left px-2.5 py-2 rounded-md transition-all text-xs ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-700'
                      : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className={`font-semibold text-neutral-900 dark:text-white ${
                      isSelected ? 'text-blue-700 dark:text-blue-300' : ''
                    }`}>{uc.uc_name}</span>
                    <div className="flex flex-col items-end">
                      <span className="tabular-nums font-bold text-blue-600 dark:text-blue-400 leading-none">{uc.active_units.toLocaleString()}</span>
                      <span className="text-[10px] text-blue-500/70 dark:text-blue-400/60 leading-none mt-0.5">active</span>
                    </div>
                  </div>
                  <div className="w-full h-1 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        pct > 80 ? 'bg-green-500' : pct > 30 ? 'bg-blue-500' : 'bg-amber-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-neutral-500">{uc.total_units.toLocaleString()} total</span>
                    <span className="text-neutral-400">{pct}% assigned</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
