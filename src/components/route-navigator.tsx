'use client'

import { useMemo, useState } from 'react'
import { useBillingStore } from '@/stores/billing-store'
import { useBillingRoutes } from '@/hooks/use-billing-routes'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, ChevronRight, MapPin, CheckCircle2 } from 'lucide-react'

export function RouteNavigator() {
  const user = useAuthStore((s) => s.user)
  const { data: routes } = useBillingRoutes(user?.id)
  const selectHouse = useBillingStore((s) => s.selectHouse)

  const [selectedRouteId, setSelectedRouteId] = useState<string>('')
  const [currentStopIdx, setCurrentStopIdx] = useState(0)

  const selectedRoute = useMemo(
    () => routes?.find((r) => r.id === selectedRouteId),
    [routes, selectedRouteId]
  )

  const stops = useMemo(
    () => selectedRoute?.route_data?.sequence || [],
    [selectedRoute]
  )

  const currentStop = stops[currentStopIdx]
  const progress = stops.length > 0 ? Math.round(((currentStopIdx + 1) / stops.length) * 100) : 0

  const goToStop = (idx: number) => {
    setCurrentStopIdx(idx)
    const stop = stops[idx]
    if (stop) selectHouse(stop.surveyId)
  }

  return (
    <div className="flex flex-col h-full p-4">
      <h2 className="text-sm font-semibold mb-3">Route Navigation</h2>

      <Select value={selectedRouteId} onValueChange={(v) => { setSelectedRouteId(v || ''); setCurrentStopIdx(0) }}>
        <SelectTrigger className="w-full mb-4">
          <SelectValue placeholder="Select a route..." />
        </SelectTrigger>
        <SelectContent>
          {(routes || []).map((r) => (
            <SelectItem key={r.id} value={r.id}>{r.route_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedRoute && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{currentStopIdx + 1}/{stops.length}</span>
          </div>

          <div className="flex gap-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              disabled={currentStopIdx <= 0}
              onClick={() => goToStop(currentStopIdx - 1)}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentStopIdx >= stops.length - 1}
              onClick={() => goToStop(currentStopIdx + 1)}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {currentStop && (
            <div className="border rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{currentStop.name}</p>
                  <p className="text-xs text-muted-foreground">Survey ID: {currentStop.surveyId}</p>
                  <p className="text-xs text-muted-foreground">
                    {currentStop.lat.toFixed(6)}, {currentStop.lng.toFixed(6)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-1">
            {stops.map((stop, idx) => (
              <button
                key={stop.surveyId}
                onClick={() => goToStop(idx)}
                className={`w-full text-left flex items-center gap-2 p-2 rounded text-xs transition-colors ${
                  idx === currentStopIdx
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted'
                }`}
              >
                {idx < currentStopIdx ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                ) : (
                  <span className="text-muted-foreground w-3.5 text-center shrink-0">{idx + 1}</span>
                )}
                <span className="truncate">{stop.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {!selectedRoute && (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Select a route to begin navigation
        </div>
      )}
    </div>
  )
}
