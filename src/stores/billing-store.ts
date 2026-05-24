import { create } from 'zustand'
import type { FilterState } from '@/types'

type ActiveView = 'map' | 'list' | 'route' | 'stats' | 'detail' | 'data-insight'
type MapType = 'streets' | 'satellite'

interface BillingState {
  activeView: ActiveView
  filters: FilterState
  selectedRouteId: string | null
  selectedHouseId: string | null
  mapCenter: [number, number]
  mapZoom: number
  mapType: MapType
  navHistory: ActiveView[]

  setView: (view: ActiveView) => void
  goBack: () => void
  setFilters: (filters: Partial<FilterState>) => void
  resetFilters: () => void
  selectRoute: (id: string | null) => void
  selectHouse: (id: string | null) => void
  setMapCenter: (center: [number, number]) => void
  setMapZoom: (zoom: number) => void
  setMapType: (type: MapType) => void
}

function currentMonth(): string {
  const m = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const d = new Date()
  return `${m[d.getMonth()]}${d.getFullYear()}`
}

const defaultFilters: FilterState = {
  districts: [],
  tehsils: [],
  ucs: [],
  surveyor: null,
  paymentStatus: 'all',
  unitType: null,
  search: '',
  billMonth: currentMonth(),
}

export const useBillingStore = create<BillingState>((set, get) => ({
  activeView: 'map',
  filters: { ...defaultFilters },
  selectedRouteId: null,
  selectedHouseId: null,
  mapCenter: [32.0836, 72.6712],
  mapZoom: 12,
  mapType: 'streets',
  navHistory: [],

  setView: (view) => set((s) => {
    const prev = s.activeView
    if (prev === view) return {}
    return {
      activeView: view,
      navHistory: [...s.navHistory, prev],
      selectedHouseId: view === 'detail' ? s.selectedHouseId : null,
    }
  }),
  goBack: () => {
    const { navHistory, activeView } = get()
    if (!navHistory.length) return
    const prev = navHistory[navHistory.length - 1]
    set({
      activeView: prev,
      navHistory: navHistory.slice(0, -1),
      selectedHouseId: prev === 'detail' ? get().selectedHouseId : null,
    })
  },
  setFilters: (partial) => set((s) => ({ filters: { ...s.filters, ...partial } })),
  resetFilters: () => set({ filters: { ...defaultFilters } }),
  selectRoute: (id) => set((s) => ({
    selectedRouteId: id,
    activeView: id ? 'route' : 'map',
    navHistory: id ? [...s.navHistory, s.activeView] : s.navHistory,
  })),
  selectHouse: (id) => set((s) => ({
    selectedHouseId: id,
    activeView: id ? 'detail' : 'map',
    navHistory: id ? [...s.navHistory, s.activeView] : s.navHistory,
  })),
  setMapCenter: (center) => set({ mapCenter: center }),
  setMapZoom: (zoom) => set({ mapZoom: zoom }),
  setMapType: (type) => set({ mapType: type }),
}))
