'use client'

import { useState, useMemo } from 'react'
import { useRouteTree } from '@/hooks/use-assignments'
import { useBillingStore } from '@/stores/billing-store'
import { CITY_TEHSIL_MAP } from '@/lib/queries/hierarchy'
import { Search, MapPin } from 'lucide-react'
import { UCDetailPanel } from './uc-detail-panel'

interface SelectedRoute {
  uc: string
  route: string
}

function ucGroup(uc_name: string): number {
  if (uc_name.startsWith('MC')) return 0
  if (uc_name.startsWith('UC')) return 1
  return 2
}

const GROUP_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'Municipal Committees', color: 'bg-blue-500' },
  1: { label: 'Union Councils', color: 'bg-emerald-500' },
  2: { label: 'Other', color: 'bg-neutral-500' },
}

export function RoutesTab() {
  const selectedCity = useBillingStore((s) => s.selectedCity)
  const cityCfg = selectedCity && selectedCity !== 'All Cities' ? CITY_TEHSIL_MAP[selectedCity] : null
  const { data: routeTree } = useRouteTree(cityCfg?.district || null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SelectedRoute | null>(null)
  const [hiddenUcs, setHiddenUcs] = useState<Set<string>>(new Set())

  const ucRoutes = useMemo(() => {
    if (!routeTree?.length) return []
    const all: { uc: string; group: number; routes: { route_name: string; unit_count: number }[]; unrouted: number }[] = []
    for (const city of routeTree) {
      for (const uc of city.ucs) {
        if (uc.routes.length === 0) continue
        all.push({
          uc: uc.uc,
          group: ucGroup(uc.uc),
          routes: uc.routes,
          unrouted: uc.unrouted,
        })
      }
    }
    return all.sort((a, b) => {
      const g = a.group - b.group
      if (g !== 0) return g
      const aN = parseInt(a.uc.match(/\d+/)?.[0] || '0', 10)
      const bN = parseInt(b.uc.match(/\d+/)?.[0] || '0', 10)
      return aN - bN
    })
  }, [routeTree])

  const filtered = useMemo(
    () => search
      ? ucRoutes.filter((u) => u.uc.toLowerCase().includes(search.toLowerCase()))
      : ucRoutes,
    [ucRoutes, search]
  )

  const grouped = useMemo(() => {
    const groups: { label: string; color: string; items: typeof ucRoutes }[] = []
    let currentGroup = -1
    for (const uc of filtered) {
      if (uc.group !== currentGroup) {
        groups.push({ ...GROUP_LABELS[uc.group], items: [] })
        currentGroup = uc.group
      }
      groups[groups.length - 1].items.push(uc)
    }
    return groups
  }, [filtered])

  const totalUnrouted = useMemo(
    () => ucRoutes.reduce((s, u) => s + u.unrouted, 0),
    [ucRoutes]
  )

  const toggleHidden = (uc: string) => {
    setHiddenUcs((prev) => {
      const next = new Set(prev)
      if (next.has(uc)) next.delete(uc)
      else next.add(uc)
      return next
    })
  }

  return (
    <div className="flex gap-0 h-full">
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-neutral-200 dark:border-neutral-700">
        <div className="p-2 border-b border-neutral-100 dark:border-neutral-800">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter UCs..."
              className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-neutral-200 dark:border-neutral-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {!filtered.length ? (
            <div className="flex items-center justify-center h-full text-sm text-neutral-400">
              No routes found
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map((group) => (
                <div key={group.label}>
                  <div className="flex items-center gap-1.5 px-1 mb-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${group.color}`} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{group.label}</span>
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((uc) => {
                      const isExpanded = !hiddenUcs.has(uc.uc)
                      return (
                        <div key={uc.uc}>
                          <button
                            onClick={() => toggleHidden(uc.uc)}
                            className="w-full text-left px-2.5 py-1.5 rounded-md transition-all text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                          >
                            <span className="font-semibold text-neutral-900 dark:text-white">{uc.uc}</span>
                            <span className="text-neutral-400 ml-1.5">
                              {uc.routes.length} route{uc.routes.length !== 1 ? 's' : ''}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="ml-2 space-y-0.5">
                              {uc.routes.map((r) => {
                                const isActive = selected?.uc === uc.uc && selected?.route === r.route_name
                                return (
                                  <button
                                    key={r.route_name}
                                    onClick={() => setSelected({ uc: uc.uc, route: r.route_name })}
                                    className={`w-full text-left px-2.5 py-1 rounded-md transition-all text-xs flex items-center gap-2 ${
                                      isActive
                                        ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-700'
                                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                                    }`}
                                  >
                                    <MapPin className={`size-3 shrink-0 ${isActive ? 'text-blue-500' : 'text-neutral-400'}`} />
                                    <span className={`truncate flex-1 ${isActive ? 'text-blue-700 dark:text-blue-300 font-medium' : 'text-neutral-600 dark:text-neutral-400'}`}>
                                      {r.route_name}
                                    </span>
                                    <span className={`tabular-nums shrink-0 ${isActive ? 'text-blue-600' : 'text-neutral-500'}`}>
                                      {r.unit_count.toLocaleString()}
                                    </span>
                                  </button>
                                )
                              })}
                              {uc.unrouted > 0 && (
                                <div className="px-2.5 py-1 text-xs text-neutral-400 italic flex items-center gap-1">
                                  <span className="text-amber-500">⚠</span>
                                  Unrouted: {uc.unrouted.toLocaleString()}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-3 py-2 text-[10px] text-neutral-400 border-t border-neutral-100 dark:border-neutral-800">
          {ucRoutes.length} UCs &middot; {totalUnrouted.toLocaleString()} unrouted
        </div>
      </div>
      <div className="flex-1 flex flex-col p-4 overflow-y-auto">
        {selected ? (
          <UCDetailPanel
            uc={selected.uc}
            city={cityCfg?.district || null}
            routeName={selected.route}
            onCreated={() => {
              setSelected(null)
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-neutral-400">
            Select a route from the sidebar
          </div>
        )}
      </div>
    </div>
  )
}
