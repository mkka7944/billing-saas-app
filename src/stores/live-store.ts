import { create } from 'zustand'
import { pktToday } from '@/lib/pkt'

interface LiveState {
  selectedCity: string
  selectedDate: string
  panelCollapsed: boolean
  panelPos: { x: number; y: number }
  panelWidth: number
  panelHeight: number | null
  staffGpsVisible: Set<string>
  setSelectedCity: (city: string) => void
  setSelectedDate: (date: string) => void
  setPanelCollapsed: (collapsed: boolean) => void
  setPanelPos: (pos: { x: number; y: number }) => void
  setPanelWidth: (width: number) => void
  setPanelHeight: (height: number | null) => void
  toggleStaffGps: (staffId: string) => void
  clearGpsVisible: () => void
}

export const useLiveStore = create<LiveState>()((set) => ({
  selectedCity: 'Sargodha',
  selectedDate: pktToday(),
  panelCollapsed: false,
  panelPos: { x: -92, y: 0 },
  panelWidth: 320,
  panelHeight: null,
  staffGpsVisible: new Set(),
  setSelectedCity: (city) => set({ selectedCity: city }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  setPanelCollapsed: (collapsed) => set({ panelCollapsed: collapsed }),
  setPanelPos: (pos) => set({ panelPos: pos }),
  setPanelWidth: (width) => set({ panelWidth: width }),
  setPanelHeight: (height) => set({ panelHeight: height }),
  toggleStaffGps: (staffId) => set((s) => {
    const next = new Set(s.staffGpsVisible)
    if (next.has(staffId)) next.delete(staffId)
    else next.add(staffId)
    return { staffGpsVisible: next }
  }),
  clearGpsVisible: () => set({ staffGpsVisible: new Set() }),
}))
