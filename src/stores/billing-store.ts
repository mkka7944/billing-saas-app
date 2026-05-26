import { create } from 'zustand'
import type { FilterState } from '@/types'
import { currentMonth } from '@/lib/constants'

interface BillingState {
  activeView: 'map' | 'list' | 'stats' | 'detail' | 'data-insight'
  filters: FilterState
  pendingFilters: FilterState
  selectedHouseId: string | null
  mapCenter: [number, number]
  mapZoom: number
  mapType: 'streets' | 'satellite'
  navHistory: string[]
  setView: (view: 'map' | 'list' | 'stats' | 'detail' | 'data-insight') => void
  goBack: () => void
  setFilters: (partial: Partial<FilterState>) => void
  resetFilters: () => void
  setPendingFilter: (partial: Partial<FilterState>) => void
  applyFilters: () => void
  cancelFilters: () => void
  selectHouse: (id: string | null) => void
  setMapCenter: (center: [number, number]) => void
  setMapZoom: (zoom: number) => void
  setMapType: (type: 'streets' | 'satellite') => void
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
  pendingFilters: { ...defaultFilters },
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
    const prev = navHistory[navHistory.length - 1] as 'map' | 'list' | 'stats' | 'detail' | 'data-insight'
    set({
      activeView: prev,
      navHistory: navHistory.slice(0, -1),
      selectedHouseId: prev === 'detail' ? get().selectedHouseId : null,
    })
  },
  setFilters: (partial) => set((s) => ({
    filters: { ...s.filters, ...partial },
    pendingFilters: { ...s.pendingFilters, ...partial },
  })),
  resetFilters: () => set({ filters: { ...defaultFilters }, pendingFilters: { ...defaultFilters } }),
  setPendingFilter: (partial) => set((s) => ({ pendingFilters: { ...s.pendingFilters, ...partial } })),
  applyFilters: () => set((s) => ({ filters: { ...s.pendingFilters } })),
  cancelFilters: () => set((s) => ({ pendingFilters: { ...s.filters } })),
  selectHouse: (id) => set((s) => ({
    selectedHouseId: id,
    activeView: id ? 'detail' : 'map',
    navHistory: id ? [...s.navHistory, s.activeView] : s.navHistory,
  })),
  setMapCenter: (center) => set({ mapCenter: center }),
  setMapZoom: (zoom) => set({ mapZoom: zoom }),
  setMapType: (type) => set({ mapType: type }),
}))
