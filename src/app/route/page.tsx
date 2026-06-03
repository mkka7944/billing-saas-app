'use client'

import { useState, useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useRouteTree, useRouteUnits } from '@/hooks/use-routes'
import { ArrowLeft, ChevronRight, ChevronDown, Loader2, MapPin } from 'lucide-react'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { useBillingStore } from '@/stores/billing-store'

export default function RoutePage() {
  const setPageIdentity = useBillingUIStore((s) => s.setPageIdentity)
  const globalCity = useBillingStore((s) => s.selectedCity)
  const globalFilters = useBillingStore((s) => s.filters)
  const globalTehsil = globalFilters.tehsils[0] || null
  const { data: tree, isLoading } = useRouteTree(globalCity, globalTehsil)
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set())
  const [expandedUcs, setExpandedUcs] = useState<Set<string>>(new Set())
  const [selectedRoute, setSelectedRoute] = useState<{ city: string; route: string } | null>(null)
  const [selectedCity, setSelectedCity] = useState<string | null>(null)

  const { data: routeUnits, isLoading: unitsLoading } = useRouteUnits(
    selectedRoute?.city || null,
    selectedRoute?.route || null,
    globalTehsil,
  )

  useEffect(() => {
    if (tree?.length && !selectedCity) {
      setSelectedCity(tree[0].city)
    }
  }, [tree, selectedCity])

  const toggleCity = (city: string) => {
    const next = new Set(expandedCities)
    if (next.has(city)) next.delete(city); else next.add(city)
    setExpandedCities(next)
    setSelectedCity(city)
  }

  const toggleUc = (uc: string) => {
    const next = new Set(expandedUcs)
    if (next.has(uc)) next.delete(uc); else next.add(uc)
    setExpandedUcs(next)
  }

  useEffect(() => { setPageIdentity('Routes') }, [setPageIdentity])

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        {selectedRoute && routeUnits ? (
          <>
            <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
              <Button variant="ghost" size="icon" onClick={() => { setSelectedRoute(null); setSelectedCity(selectedRoute.city) }}>
                <ArrowLeft className="size-4" />
              </Button>
              <h1 className="text-sm font-medium truncate">{selectedRoute.route}</h1>
              <span className="text-xs text-muted-foreground shrink-0">{routeUnits.length} stops</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {unitsLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  <Loader2 className="size-4 mr-2 animate-spin" /> Loading...
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Consumer</TableHead>
                        <TableHead>PSID</TableHead>
                        <TableHead>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routeUnits.map((u, i) => (
                        <TableRow key={u.survey_id}>
                          <TableCell className="text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                          <TableCell className="text-xs max-w-[250px] truncate">{u.consumer_name || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{u.psid?.slice(-8) || '-'}</TableCell>
                          <TableCell className="text-xs tabular-nums">{(u.monthly_fee ?? 0) + (u.arrears ?? 0) > 0 ? `Rs. ${((u.monthly_fee ?? 0) + (u.arrears ?? 0)).toLocaleString()}` : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* City tree sidebar — full width on mobile, 256px on desktop */}
            <div className="w-full lg:w-64 border-r overflow-y-auto shrink-0 p-2 space-y-1">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1">Cities</h2>
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              ) : (tree || []).map((city) => (
                <div key={city.city}>
                  <button
                    onClick={() => toggleCity(city.city)}
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors ${
                      selectedCity === city.city ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    }`}
                  >
                    {expandedCities.has(city.city) ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
                    <span className="font-medium">{city.city}</span>
                    <span className="text-muted-foreground ml-auto">{city.ucs.length} UCs</span>
                  </button>
                  {expandedCities.has(city.city) && (
                    <div className="ml-3 mt-0.5 space-y-0.5">
                      {city.ucs.map((uc) => (
                        <div key={uc.uc}>
                          <button
                            onClick={() => toggleUc(uc.uc)}
                            className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
                          >
                            {expandedUcs.has(uc.uc) ? <ChevronDown className="size-2.5 shrink-0" /> : <ChevronRight className="size-2.5 shrink-0" />}
                            <span className="truncate">{uc.uc}</span>
                            <span className="ml-auto">{uc.routes.length}</span>
                          </button>
                          {expandedUcs.has(uc.uc) && (
                            <div className="ml-3 mt-0.5 space-y-0.5">
                              {uc.routes.map((r) => (
                                <button
                                  key={r.route_name}
                                  onClick={() => setSelectedRoute({ city: city.city, route: r.route_name })}
                                  className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-muted transition-colors"
                                >
                                  <MapPin className="size-2.5 shrink-0 text-muted-foreground" />
                                  <span className="truncate">{r.route_name}</span>
                                  <span className="text-muted-foreground ml-auto">{r.unit_count}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Empty state — hidden on mobile when tree is full width */}
            <div className="hidden lg:flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Select a route to view its stops
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
