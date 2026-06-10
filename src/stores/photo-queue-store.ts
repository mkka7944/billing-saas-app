import { create } from 'zustand'

interface PhotoQueueStore {
  queueCount: number
  setQueueCount: (count: number) => void
}

export const usePhotoQueueStore = create<PhotoQueueStore>((set) => ({
  queueCount: 0,
  setQueueCount: (queueCount) => set({ queueCount }),
}))
