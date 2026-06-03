import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FilterState, SurveyUnit, SortConfig } from '@/types'
import { currentMonth } from '@/lib/constants'
import { CITY_TEHSIL_MAP } from '@/lib/queries/hierarchy'

interface BillingState {
  selectedCity: string | null
  activeView: 'map' | 'list' | 'stats' | 'detail' | 'data-insight'
  previousView: string
  filters: FilterState
  pendingFilters: FilterState
  selectedHouseId: string | null
  deliverTargetId: string | null
  mapCenter: [number, number]
  mapZoom: number
  mapType: 'streets' | 'satellite'
  houseList: SurveyUnit[]
  houseListIndex: number
  houseListTotal: number
  setCity: (city: string | null, district?: string | null, tehsil?: string | null) => void
  setView: (view: 'map' | 'list' | 'stats' | 'detail' | 'data-insight') => void
  setDeliverTarget: (id: string | null) => void
  setFilters: (partial: Partial<FilterState>) => void
  setSortConfig: (config: SortConfig) => void
  resetFilters: () => void
  setPendingFilter: (partial: Partial<FilterState>) => void
  applyFilters: () => void
  cancelFilters: () => void
  selectHouse: (id: string | null, list?: SurveyUnit[], total?: number) => void
  nextHouse: () => void
  prevHouse: () => void
  firstHouse: () => void
  lastHouse: () => void
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
  sort: { field: 'survey_id', direction: 'desc' },
}

export const CITY_CONFIG: Record<string, { district: string; tehsil: string; lat: number; lng: number }> = {
  Sargodha: { ...CITY_TEHSIL_MAP.Sargodha, lat: 32.0836, lng: 72.6712 },
  Bhalwal: { ...CITY_TEHSIL_MAP.Bhalwal, lat: 32.265, lng: 72.905 },
  Khushab: { ...CITY_TEHSIL_MAP.Khushab, lat: 32.295, lng: 72.352 },
}

export const useBillingStore = create<BillingState>()(
  persist(
    (set, get) => ({
      selectedCity: null,
      activeView: 'map',
      previousView: 'map',
      filters: { ...defaultFilters },
      pendingFilters: { ...defaultFilters },
      selectedHouseId: null,
      deliverTargetId: null,
      houseList: [],
      houseListIndex: 0,
      houseListTotal: 0,
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
      setSortConfig: (config) => set((s) => ({
        filters: { ...s.filters, sort: config },
        pendingFilters: { ...s.pendingFilters, sort: config },
      })),
      resetFilters: () => set((s) => ({
        filters: { ...defaultFilters, districts: s.filters.districts, tehsils: s.filters.tehsils, sort: s.filters.sort },
        pendingFilters: { ...defaultFilters, districts: s.pendingFilters.districts, tehsils: s.pendingFilters.tehsils, sort: s.pendingFilters.sort },
      })),
      setPendingFilter: (partial) => set((s) => ({ pendingFilters: { ...s.pendingFilters, ...partial } })),
      applyFilters: () => set((s) => ({ filters: { ...s.pendingFilters } })),
      cancelFilters: () => set((s) => ({ pendingFilters: { ...s.filters } })),
      setDeliverTarget: (id) => set({ deliverTargetId: id, activeView: id ? 'map' : (get().activeView === 'map' ? 'map' : get().activeView) }),

      selectHouse: (id, list, total) => {
        if (!id) {
          const prev = get().previousView || 'map'
          return set({ selectedHouseId: null, activeView: prev as BillingState['activeView'], previousView: 'map', houseList: [], houseListIndex: 0, houseListTotal: 0 })
        }
        const s = get()
        const idx = list ? list.findIndex((h) => h.survey_id === id) : -1
        set({
          selectedHouseId: id,
          activeView: 'detail',
          previousView: s.activeView === 'detail' ? s.previousView : s.activeView,
          houseList: list || [],
          houseListIndex: idx >= 0 ? idx : 0,
          houseListTotal: total ?? list?.length ?? 0,
        })
      },
      nextHouse: () => {
        const { houseList, houseListIndex, selectedHouseId } = get()
        if (houseListIndex < houseList.length - 1) {
          const next = houseListIndex + 1
          const nextId = houseList[next].survey_id
          if (nextId !== selectedHouseId) {
            set({ selectedHouseId: nextId, houseListIndex: next })
          }
        }
      },
      prevHouse: () => {
        const { houseList, houseListIndex, selectedHouseId } = get()
        if (houseListIndex > 0) {
          const prev = houseListIndex - 1
          const prevId = houseList[prev].survey_id
          if (prevId !== selectedHouseId) {
            set({ selectedHouseId: prevId, houseListIndex: prev })
          }
        }
      },
      firstHouse: () => {
        const { houseList, selectedHouseId } = get()
        if (houseList.length > 0) {
          const firstId = houseList[0].survey_id
          if (firstId !== selectedHouseId) {
            set({ selectedHouseId: firstId, houseListIndex: 0 })
          }
        }
      },
      lastHouse: () => {
        const { houseList, selectedHouseId } = get()
        const last = houseList.length - 1
        if (last >= 0) {
          const lastId = houseList[last].survey_id
          if (lastId !== selectedHouseId) {
            set({ selectedHouseId: lastId, houseListIndex: last })
          }
        }
      },
      setMapCenter: (center) => set({ mapCenter: center }),
      setMapZoom: (zoom) => set({ mapZoom: zoom }),
      setMapType: (type) => set({ mapType: type }),
    }),
    {
      name: 'billing-store',
      partialize: (state) => ({ selectedCity: state.selectedCity, mapCenter: state.mapCenter, mapZoom: state.mapZoom }),
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
