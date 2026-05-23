import { create } from 'zustand'
import type { FilterState } from '@/types'

type ActiveView = 'map' | 'list' | 'route' | 'stats' | 'detail'

interface BillingState {
  activeView: ActiveView
  filters: FilterState
  selectedRouteId: string | null
  selectedHouseId: string | null
  mapCenter: [number, number]
  mapZoom: number

  setView: (view: ActiveView) => void
  setFilters: (filters: Partial<FilterState>) => void
  resetFilters: () => void
  selectRoute: (id: string | null) => void
  selectHouse: (id: string | null) => void
  setMapCenter: (center: [number, number]) => void
  setMapZoom: (zoom: number) => void
}

const defaultFilters: FilterState = {
  districts: [],
  tehsils: [],
  ucs: [],
  surveyor: null,
  paymentStatus: 'all',
  unitType: null,
  search: '',
}

export const useBillingStore = create<BillingState>((set) => ({
  activeView: 'map',
  filters: { ...defaultFilters },
  selectedRouteId: null,
  selectedHouseId: null,
  mapCenter: [32.0836, 72.6712],
  mapZoom: 12,

  setView: (view) => set({ activeView: view, selectedHouseId: view === 'detail' ? undefined as unknown as string : null }),
  setFilters: (partial) => set((s) => ({ filters: { ...s.filters, ...partial } })),
  resetFilters: () => set({ filters: { ...defaultFilters } }),
  selectRoute: (id) => set({ selectedRouteId: id, activeView: id ? 'route' : 'map' }),
  selectHouse: (id) => set({ selectedHouseId: id, activeView: id ? 'detail' : 'map' }),
  setMapCenter: (center) => set({ mapCenter: center }),
  setMapZoom: (zoom) => set({ mapZoom: zoom }),
}))
