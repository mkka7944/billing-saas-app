import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FilterState } from '@/types'
import { currentMonth } from '@/lib/constants'

interface BillingState {
  selectedCity: string | null
  activeView: 'map' | 'list' | 'stats' | 'detail' | 'data-insight'
  filters: FilterState
  pendingFilters: FilterState
  selectedHouseId: string | null
  mapCenter: [number, number]
  mapZoom: number
  mapType: 'streets' | 'satellite'
  setCity: (city: string | null, district?: string | null, tehsil?: string | null) => void
  setView: (view: 'map' | 'list' | 'stats' | 'detail' | 'data-insight') => void
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

export const CITY_CONFIG: Record<string, { district: string; tehsil: string; lat: number; lng: number }> = {
  Sargodha: { district: 'SARGODHA', tehsil: 'SARGODHA', lat: 32.0836, lng: 72.6712 },
  Bhalwal: { district: 'SARGODHA', tehsil: 'BHALWAL', lat: 32.265, lng: 72.905 },
  Khushab: { district: 'KHUSHAB', tehsil: 'KHUSHAB', lat: 32.295, lng: 72.352 },
}

export const useBillingStore = create<BillingState>()(
  persist(
    (set, get) => ({
      selectedCity: null,
      activeView: 'map',
      filters: { ...defaultFilters },
      pendingFilters: { ...defaultFilters },
      selectedHouseId: null,
      mapCenter: [32.0836, 72.6712],
      mapZoom: 12,
      mapType: 'streets',

      setCity: (city, district, tehsil) => {
        const districts = district ? [district] : []
        const tehsils = tehsil ? [tehsil] : []
        const cfg = city ? CITY_CONFIG[city] : null
        set((s) => ({
          selectedCity: city,
          mapCenter: cfg ? [cfg.lat, cfg.lng] : s.mapCenter,
          filters: { ...s.filters, districts, tehsils, ucs: [] },
          pendingFilters: { ...s.pendingFilters, districts, tehsils, ucs: [] },
        }))
      },

      setView: (view) => set((s) => {
        if (s.activeView === view) return {}
        return { activeView: view, selectedHouseId: view === 'detail' ? s.selectedHouseId : null }
      }),
      setFilters: (partial) => set((s) => ({
        filters: { ...s.filters, ...partial },
        pendingFilters: { ...s.pendingFilters, ...partial },
      })),
      resetFilters: () => set((s) => ({
        filters: { ...defaultFilters, districts: s.filters.districts, tehsils: s.filters.tehsils },
        pendingFilters: { ...defaultFilters, districts: s.pendingFilters.districts, tehsils: s.pendingFilters.tehsils },
      })),
      setPendingFilter: (partial) => set((s) => ({ pendingFilters: { ...s.pendingFilters, ...partial } })),
      applyFilters: () => set((s) => ({ filters: { ...s.pendingFilters } })),
      cancelFilters: () => set((s) => ({ pendingFilters: { ...s.filters } })),
      selectHouse: (id) => set({ selectedHouseId: id, activeView: id ? 'detail' : 'map' }),
      setMapCenter: (center) => set({ mapCenter: center }),
      setMapZoom: (zoom) => set({ mapZoom: zoom }),
      setMapType: (type) => set({ mapType: type }),
    }),
    {
      name: 'billing-store',
      partialize: (state) => ({ selectedCity: state.selectedCity }),
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<BillingState>) } as BillingState
        if (merged.selectedCity) {
          const cfg = CITY_CONFIG[merged.selectedCity]
          if (cfg) {
            if (!merged.filters.districts.length || merged.filters.districts[0] !== cfg.district) {
              const sync = { districts: [cfg.district], tehsils: [cfg.tehsil], ucs: [] as string[] }
              merged.filters = { ...merged.filters, ...sync }
              merged.pendingFilters = { ...merged.pendingFilters, ...sync }
            }
          }
        }
        return merged
      },
    }
  )
)
