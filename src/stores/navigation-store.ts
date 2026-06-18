import { create } from 'zustand'

interface NavigationState {
  isNavigating: boolean
  start: () => void
  stop: () => void
}

let stopTimer: ReturnType<typeof setTimeout> | null = null

export const useNavStore = create<NavigationState>((set) => ({
  isNavigating: false,
  start: () => {
    if (stopTimer) clearTimeout(stopTimer)
    set({ isNavigating: true })
    stopTimer = setTimeout(() => {
      set({ isNavigating: false })
      stopTimer = null
    }, 3000)
  },
  stop: () => {
    if (stopTimer) {
      clearTimeout(stopTimer)
      stopTimer = null
    }
    set({ isNavigating: false })
  },
}))
