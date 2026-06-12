import { create } from 'zustand'

interface PhotoQueueStore {
  queueCount: number
  isProcessing: boolean
  processingIndex: number
  totalToProcess: number
  currentFileSize: string
  uploadSpeed: string
  lastError: string | null
  setQueueCount: (count: number) => void
  setProcessing: (processing: boolean) => void
  setProcessingIndex: (index: number) => void
  setTotalToProcess: (total: number) => void
  setCurrentFileSize: (size: string) => void
  setUploadSpeed: (speed: string) => void
  setLastError: (error: string | null) => void
}

export const usePhotoQueueStore = create<PhotoQueueStore>((set) => ({
  queueCount: 0,
  isProcessing: false,
  processingIndex: 0,
  totalToProcess: 0,
  currentFileSize: '',
  uploadSpeed: '',
  lastError: null,
  setQueueCount: (queueCount) => set({ queueCount }),
  setProcessing: (isProcessing) => set({ isProcessing }),
  setProcessingIndex: (processingIndex) => set({ processingIndex }),
  setTotalToProcess: (totalToProcess) => set({ totalToProcess }),
  setCurrentFileSize: (currentFileSize) => set({ currentFileSize }),
  setUploadSpeed: (uploadSpeed) => set({ uploadSpeed }),
  setLastError: (lastError) => set({ lastError }),
}))
