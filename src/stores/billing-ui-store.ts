import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface BillingUIState {
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  pageTitle: string
  pageSubtitle: string
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebarCollapse: () => void
  setPageIdentity: (title: string, subtitle?: string) => void
}

export const useBillingUIStore = create<BillingUIState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      sidebarCollapsed: false,
      pageTitle: '',
      pageSubtitle: '',
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebarCollapse: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setPageIdentity: (title, subtitle = '') => set({ pageTitle: title, pageSubtitle: subtitle }),
    }),
    {
      name: 'billing-ui-storage',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    }
  )
)
