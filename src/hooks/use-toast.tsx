'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

let toastId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) { clearTimeout(timer); timersRef.current.delete(id) }
  }, [])

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `toast-${++toastId}`
    setToasts((prev) => [...prev, { id, message, variant }])
    const timer = setTimeout(() => removeToast(id), 4000)
    timersRef.current.set(id, timer)
  }, [removeToast])

  return (
    <ToastContext value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="alert"
              onClick={() => removeToast(t.id)}
              className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium cursor-pointer transition-opacity duration-200 ${
                t.variant === 'success' ? 'bg-green-600 text-white' :
                t.variant === 'error' ? 'bg-red-600 text-white' :
                t.variant === 'warning' ? 'bg-yellow-500 text-white' :
                'bg-blue-600 text-white'
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext>
  )
}
