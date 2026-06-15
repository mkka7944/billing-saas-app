import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FilterState, SurveyUnit, SortConfig, AssignmentItemUnit } from '@/types'
import { currentMonth } from '@/lib/constants'
import { CITY_TEHSIL_MAP } from '@/lib/queries/hierarchy'

interface BillingState {
  selectedCity: string | null
  activeView: 'map' | 'list' | 'stats' | 'detail' | 'data-insight'
  filters: FilterState
  pendingFilters: FilterState
  selectedHouseId: string | null
  deliverTargetId: string | null
  deliverTargetUnit: AssignmentItemUnit | null
  deliverableList: AssignmentItemUnit[]
  deliverableIndex: number
  mapCenter: [number, number]
  mapZoom: number
  mapType: 'streets' | 'satellite'
  houseList: SurveyUnit[]
  houseListIndex: number
  houseListTotal: number
  listPage: number
  queryDuration: number | null
  isFetching: boolean
  mapMarkers: SurveyUnit[]
  houseSource: 'map' | 'list' | 'data-insight' | null
  setCity: (city: string | null, district?: string | null, tehsil?: string | null) => void
  setListPage: (page: number) => void
  setView: (view: 'map' | 'list' | 'stats' | 'detail' | 'data-insight') => void
  setDeliverTarget: (id: string | null, unit?: AssignmentItemUnit | null) => void
  setDeliverableList: (list: AssignmentItemUnit[]) => void
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
  nextDeliverable: () => void
  prevDeliverable: () => void
  setMapCenter: (center: [number, number]) => void
  setMapZoom: (zoom: number) => void
  setMapType: (type: 'streets' | 'satellite') => void
  setQueryDuration: (duration: number | null) => void
  setIsFetching: (fetching: boolean) => void
  setMapMarkers: (markers: SurveyUnit[]) => void
  setHouseSource: (source: 'map' | 'list' | 'data-insight' | null) => void
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
  TestCity: { ...CITY_TEHSIL_MAP.TestCity, lat: 32.0716, lng: 72.6577 },
}

export const useBillingStore = create<BillingState>()(
  persist(
    (set, get) => ({
      selectedCity: null,
      activeView: 'map',
      filters: { ...defaultFilters },
      pendingFilters: { ...defaultFilters },
      selectedHouseId: null,
      deliverTargetId: null,
      deliverTargetUnit: null,
      deliverableList: [],
      deliverableIndex: 0,
      houseList: [],
      houseListIndex: 0,
      houseListTotal: 0,
      listPage: 1,
      queryDuration: null,
      isFetching: false,
      mapMarkers: [],
      houseSource: null,
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
      setDeliverTarget: (id, unit) => set((s) => {
        if (id == null) {
          return { deliverTargetId: null, deliverTargetUnit: null, activeView: s.activeView === 'map' ? 'map' : s.activeView }
        }
        const idx = s.deliverableList.findIndex((d) => d.psid === id)
        return {
          deliverTargetId: id,
          deliverTargetUnit: unit ?? s.deliverTargetUnit,
          deliverableIndex: idx >= 0 ? idx : s.deliverableIndex,
          activeView: 'map',
        }
      }),
      setDeliverableList: (list) => set((s) => {
        const idx = s.deliverTargetId ? list.findIndex((d) => d.psid === s.deliverTargetId) : -1
        return { deliverableList: list, deliverableIndex: idx >= 0 ? idx : 0 }
      }),
      nextDeliverable: () => {
        const { deliverableList, deliverableIndex } = get()
        if (deliverableIndex < deliverableList.length - 1) {
          const next = deliverableList[deliverableIndex + 1]
          set({ deliverableIndex: deliverableIndex + 1, deliverTargetId: next.psid, deliverTargetUnit: next })
        }
      },
      prevDeliverable: () => {
        const { deliverableList, deliverableIndex } = get()
        if (deliverableIndex > 0) {
          const prev = deliverableList[deliverableIndex - 1]
          set({ deliverableIndex: deliverableIndex - 1, deliverTargetId: prev.psid, deliverTargetUnit: prev })
        }
      },

      selectHouse: (id, list, total) => {
        if (!id) {
          return set({ selectedHouseId: null, houseList: [], houseListIndex: 0, houseListTotal: 0 })
        }
        const idx = list ? list.findIndex((h) => h.survey_id === id) : -1
        set({
          selectedHouseId: id,
          houseList: list || [],
          houseListIndex: idx >= 0 ? idx : 0,
          houseListTotal: total ?? list?.length ?? 0,
        })
      },
      nextHouse: () => {
        const { houseList, houseListIndex, selectedHouseId, listPage } = get()
        if (houseListIndex < houseList.length - 1) {
          const next = houseListIndex + 1
          const nextId = houseList[next].survey_id
          if (nextId !== selectedHouseId) {
            set({ selectedHouseId: nextId, houseListIndex: next })
          }
        } else if (houseList.length > 0) {
          set({ listPage: listPage + 1 })
        }
      },
      prevHouse: () => {
        const { houseList, houseListIndex, selectedHouseId, listPage } = get()
        if (houseListIndex > 0) {
          const prev = houseListIndex - 1
          const prevId = houseList[prev].survey_id
          if (prevId !== selectedHouseId) {
            set({ selectedHouseId: prevId, houseListIndex: prev })
          }
        } else if (listPage > 1) {
          set({ listPage: listPage - 1 })
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
      setListPage: (page) => set({ listPage: Math.max(1, page) }),
      setQueryDuration: (duration) => set({ queryDuration: duration }),
      setIsFetching: (fetching) => set({ isFetching: fetching }),
      setMapMarkers: (markers) => set({ mapMarkers: markers }),
      setHouseSource: (source) => set({ houseSource: source }),
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
